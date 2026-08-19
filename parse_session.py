import json, re, sys

PATH = "C:/Users/lf/.claude/projects/C--Users-lf-Documents-Workspace-marisa-distro/361f287c-8af8-4af8-b081-71ed6b74cf8d.jsonl"

KEYWORDS = ["esbuild","bundle","SEA","external","entry","入口","动态","require","import",
            "plugin","插件","__dirname","__filename","dlopen","worker","child_process",
            "spawn","gen-external","make-bundle","bin.js","cosmokit","colour","prune",
            ".dsh","wasm","node-gyp","node-pre-gyp","bindings","cjs","esm","single executable"]

def text_of(content):
    if isinstance(content, str):
        return content
    out = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict):
                t = b.get("type")
                if t == "text":
                    out.append(b.get("text",""))
                elif t == "tool_use":
                    out.append("[TOOL_USE "+str(b.get("name",""))+"] "+json.dumps(b.get("input",{}),ensure_ascii=False))
                elif t == "tool_result":
                    c = b.get("content","")
                    out.append("[TOOL_RESULT] "+(c if isinstance(c,str) else json.dumps(c,ensure_ascii=False)))
                elif t == "thinking":
                    out.append("[THINKING] "+b.get("thinking",""))
            elif isinstance(b,str):
                out.append(b)
    return "\n".join(out)

def main():
    kw_re = re.compile("|".join(re.escape(k) for k in KEYWORDS), re.IGNORECASE)
    hits = []
    with open(PATH, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line=line.strip()
            if not line: continue
            try:
                obj = json.loads(line)
            except: continue
            msg = obj.get("message")
            if not isinstance(msg, dict): continue
            role = msg.get("role")
            if role not in ("user","assistant"): continue
            txt = text_of(msg.get("content"))
            if kw_re.search(txt):
                hits.append((i, role, txt))
    print("TOTAL HITS:", len(hits))
    for i, role, txt in hits:
        print("\n===== line",i,role,"=====")
        # print lines that contain keyword plus context
        lines = txt.split("\n")
        for j,l in enumerate(lines):
            if kw_re.search(l):
                lo=max(0,j-1); hi=min(len(lines),j+2)
                for k in range(lo,hi):
                    print(("> " if k==j else "  ")+lines[k][:500])

main()
