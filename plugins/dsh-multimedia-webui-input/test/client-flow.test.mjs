import assert from 'node:assert/strict';
import test from 'node:test';

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children };
    },
    useCallback(fn) {
      return fn;
    },
    useEffect() {},
    useState(initial) {
      return [initial, () => {}];
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
  };
}

test('selection stays browser-local until the DSH reference serializer sends it', async () => {
  const previous = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    window: globalThis.window,
  };
  let handoff;
  const styles = [];
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        handoff = value;
      },
    },
  };
  globalThis.document = {
    head: { appendChild(value) { styles.push(value); } },
    querySelector() { return null; },
    createElement(type) {
      return { type, dataset: {}, setAttribute() {}, addEventListener() {}, click() {} };
    },
  };
  const fetches = [];
  globalThis.fetch = async (url, options = {}) => {
    fetches.push({ url: String(url), options });
    if (String(url).endsWith('/batches')) {
      return new Response(JSON.stringify({ ok: true, batchId: 'batch-one', files: [{ index: 0, actualPath: 'note.txt' }] }), { status: 201 });
    }
    if (String(url).includes('/files/0')) {
      return new Response(JSON.stringify({ ok: true, index: 0 }), { status: 200 });
    }
    if (String(url).endsWith('/commit')) {
      return new Response(JSON.stringify({
        ok: true,
        root: '/workspace/.dsh/tmp/attachments/session/send',
        manifest: '/workspace/.dsh/tmp/attachments/session/send/.dsh-workspace-attachments.json',
        files: [{
          originalPath: 'note.txt',
          actualPath: 'note.txt',
          absolutePath: '/workspace/.dsh/tmp/attachments/session/send/note.txt',
          size: 5,
        }],
      }), { status: 200 });
    }
    if (options.method === 'DELETE') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const url = new URL('../lib/client.js', import.meta.url);
    url.searchParams.set('test', String(Date.now()));
    await import(url.href);
    assert.equal(handoff.id, '@dsh-community/multimedia-webui-input');
    const plugin = handoff.factory(specifier => {
      if (specifier === 'react') return fakeReact();
      throw new Error(`unexpected client require ${specifier}`);
    });

    let source;
    const registrations = [];
    let snapshot = { draft: '', draftRev: 0, phase: 'plain', occurrences: [] };
    let inserted;
    const input = {
      state: { getSnapshot: () => snapshot },
      setDraft(draft) {
        snapshot = { ...snapshot, draft, draftRev: snapshot.draftRev + 1 };
      },
      insertReference(reference, span) {
        inserted = { reference, span };
        snapshot = {
          ...snapshot,
          draft: `${snapshot.draft}\uFFFC`,
          draftRev: snapshot.draftRev + 1,
          occurrences: [
            ...snapshot.occurrences,
            { ...reference, offset: span.start, occurrenceId: snapshot.occurrences.length + 1 },
          ],
        };
        return true;
      },
    };
    const services = {
      conversation: { input: { for: () => input } },
      sessions: { scope: () => ({}) },
      slash: {
        registerSource(value) {
          source = value;
          return () => {};
        },
      },
    };
    const ctx = {
      effect(factory) {
        factory();
      },
      get(name) {
        return services[name];
      },
      inject(_deps, callback) {
        callback({
          effect(factory) { factory(); },
          slots: {
            inject(_name, factory) {
              return factory();
            },
            register(options, component) {
              registrations.push({ options, component });
              return () => {};
            },
          },
        });
      },
    };
    plugin.apply(ctx);
    assert.match(styles[0].textContent, /\.dshca-dock:has\(\+ \* \.dshca-hero-dock\)\{display:none\}/,
      'the hero overlay must suppress the duplicate generic dock in blank sessions');

    const left = registrations.find(row => row.options.name === 'conversation.input.left');
    assert.ok(left);
    const file = { name: 'note.txt', size: 5, type: 'text/plain', lastModified: 1 };
    await left.options.inject('session-one').add([{ file, path: 'note.txt' }]);
    assert.equal(fetches.length, 0, 'choosing an attachment must not copy it');
    assert.equal(inserted.reference.source, 'multimedia-webui-input');
    assert.equal(inserted.reference.label, '📎 note.txt');
    const sendRef = inserted.reference.ref;

    await left.options.inject('session-one').add([{ file, path: 'cancelled.txt' }]);
    const cancelledRef = inserted.reference.ref;
    const dock = registrations.find(row => row.options.name === 'conversation.input.dock');
    assert.ok(dock);
    dock.options.inject('session-one').remove(snapshot.occurrences.find(row => row.ref === cancelledRef));
    assert.equal(fetches.length, 0, 'removing a composer attachment must not upload it');
    await assert.rejects(
      source.codec.serialize(cancelledRef, new AbortController().signal),
      /no longer available/,
    );

    await left.options.inject('session-one').add([{ file, path: 'extraordinary-long-file-name.txt' }]);
    assert.equal(inserted.reference.label, '📎 extraord…',
      'the fixed-width native cell keeps both the icon and a recognizable name prefix');
    dock.options.inject('session-one').remove(snapshot.occurrences.find(row => row.ref === inserted.reference.ref));

    const text = await source.codec.serialize(sendRef, new AbortController().signal);
    assert.equal(fetches.length, 3, 'send performs create, file upload, and commit');
    assert.equal(text.split('\n')[0], '/workspace/.dsh/tmp/attachments/session/send');
    assert.match(text, /DSH_MULTIMEDIA_INPUT_V1/);
    assert.match(text, /Manifest: \.dsh-workspace-attachments\.json/);
    assert.match(text, /"note\.txt" \(5 B\)/);
    assert.equal(text.match(/\/workspace\/\.dsh\/tmp\/attachments\/session\/send/g)?.length, 1,
      'the absolute root is sent once; the manifest carries the complete mapping');
    assert.ok(registrations.some(row => row.options.name === 'settings.section' && row.options.id === 'attachments'));
  } finally {
    globalThis.document = previous.document;
    globalThis.fetch = previous.fetch;
    globalThis.window = previous.window;
  }
});
