/**
 * locales.ts — i18n dictionaries for the interpreters configuration card.
 *
 * Keys cover both the card chrome (replicated from upstream PluginCard:
 * expand/collapse/unsaved/saveFailed/readOnly/save/saving/discard) and the
 * plugin's own copy (title/intro + the three field labels and hints).
 *
 * @module dsh-interpreters/client/locales
 */
export const NS = 'interpreters';
export const zh = {
    title: '解释器路径',
    intro: '配置 run_python / run_node 工具使用的解释器路径。',
    pythonPath: 'Python 可执行文件路径',
    pythonHelp: '模型通过 run_python 工具调用该路径执行 Python 代码。留空使用系统默认 python。',
    nodePath: 'Node.js 可执行文件路径',
    nodeHelp: '模型通过 run_node 工具调用该路径执行 Node.js 代码。留空使用系统默认 node。',
    timeoutMs: '执行超时（毫秒）',
    timeoutHelp: '超过该时长进程将被强制终止。',
    save: '保存',
    saving: '保存中…',
    discard: '放弃修改',
    unsaved: '未保存',
    saveFailed: '本部署没有接受这些值，已保留供你修改。',
    readOnly: '本部署的设置为只读。',
    expand: '展开设置',
    collapse: '收起设置',
    namespaceUnavailable: '解释器配置通道当前不可用。请稍后重试。',
    retry: '重试',
};
export const en = {
    title: 'Interpreter paths',
    intro: 'Configure the interpreter executables used by the run_python / run_node tools.',
    pythonPath: 'Python executable path',
    pythonHelp: 'The model uses this path to execute Python code via the run_python tool. Leave empty to use the system default python.',
    nodePath: 'Node.js executable path',
    nodeHelp: 'The model uses this path to execute Node.js code via the run_node tool. Leave empty to use the system default node.',
    timeoutMs: 'Execution timeout (ms)',
    timeoutHelp: 'The process is killed after this duration.',
    save: 'Save',
    saving: 'Saving…',
    discard: 'Discard',
    unsaved: 'Unsaved',
    saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
    readOnly: 'This deployment stores settings read-only.',
    expand: 'Show settings',
    collapse: 'Hide settings',
    namespaceUnavailable: 'The interpreter configuration channel is unavailable. Please retry later.',
    retry: 'Retry',
};
