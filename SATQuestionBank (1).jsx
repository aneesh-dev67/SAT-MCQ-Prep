import { useState, useEffect, useRef, useCallback } from "react";

// ─── FILENAME METADATA PARSER ─────────────────────────────────────────────────
const KNOWN_SECTIONS = ["Reading and Writing", "Math"];
const KNOWN_DOMAINS = [
  "Information and Ideas","Craft and Structure","Expression of Ideas",
  "Standard English Conventions","Algebra","Advanced Math",
  "Problem Solving and Data Analysis","Geometry and Trigonometry",
];
const KNOWN_SKILLS = [
  "Central Ideas and Details","Inferences","Command of Evidence",
  "Words in Context","Text Structure and Purpose","Cross Text Connections",
  "Rhetorical Synthesis","Transitions","Boundaries","Form Structure and Sense",
  "Linear equations in one variable","Linear functions","Linear equations in two variables",
  "Systems of two linear equations in two variables","Linear inequalities in one or two variables",
  "Nonlinear functions","Nonlinear equations in one variable and systems of equations in two variables",
  "Equivalent expressions","Ratios rates proportional relationships and units","Percentages",
  "One variable data Distributions and measures of center and spread",
  "Two variable data Models and scatterplots","Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims Observational studies and experiments",
  "Area and volume","Lines angles and triangles","Right triangles and trigonometry","Circles",
];

function parseFilename(filename) {
  let name = filename.replace(/\.pdf$/i, "").replace(/_/g, " ");
  let section = "Unknown", domain = "Unknown", skill = "Unknown", difficulty = "Unknown";
  // Difficulty = last word
  for (const d of ["Easy","Medium","Hard"]) {
    if (name.endsWith(" " + d)) { difficulty = d; name = name.slice(0, -(d.length+1)).trim(); break; }
  }
  // Section
  for (const s of KNOWN_SECTIONS) {
    if (name.toLowerCase().startsWith(s.toLowerCase())) {
      section = s.toLowerCase().includes("reading") ? "Reading & Writing" : s;
      name = name.slice(s.length).trim(); break;
    }
  }
  // Domain
  for (const d of [...KNOWN_DOMAINS].sort((a,b) => b.length - a.length)) {
    if (name.toLowerCase().startsWith(d.toLowerCase())) {
      domain = d; name = name.slice(d.length).trim(); break;
    }
  }
  // Skill = remainder, matched against known list
  skill = name.trim() || "Unknown";
  for (const k of [...KNOWN_SKILLS].sort((a,b) => b.length - a.length)) {
    if (name.toLowerCase() === k.toLowerCase()) { skill = k; break; }
  }
  return { section, domain, skill, difficulty };
}

// ─── PDF PARSER ───────────────────────────────────────────────────────────────
function parsePDFText(rawText, filename) {
  const questions = [];
  const { section, domain, skill, difficulty: fileDifficulty } = parseFilename(filename);
  let difficulty = fileDifficulty;

  const blocks = rawText.split(/Question ID\s+/i).filter(b => b.trim().length > 10);

  for (const block of blocks) {
    try {
      const lines = block.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 6) continue;
      const id = lines[0].replace(/^ID:\s*/i, "").trim();
      const answerHeaderIdx = lines.findIndex(l => /^ID:.*Answer/i.test(l));
      if (answerHeaderIdx === -1) continue;
      const correctAnswerIdx = lines.findIndex(l => /^Correct Answer:/i.test(l));
      if (correctAnswerIdx === -1) continue;
      const answer = lines[correctAnswerIdx].replace(/^Correct Answer:\s*/i, "").trim().charAt(0).toUpperCase();
      if (!["A","B","C","D"].includes(answer)) continue;
      const rationaleIdx = lines.findIndex(l => /^Rationale/i.test(l));
      let explanation = "";
      if (rationaleIdx !== -1) {
        const after = lines.slice(rationaleIdx + 1);
        const endIdx = after.findIndex(l => /^Question Difficulty:/i.test(l) || /^Assessment$/i.test(l));
        explanation = (endIdx !== -1 ? after.slice(0, endIdx) : after.slice(0, 8)).join(" ").trim();
      }
      const diffLine = lines.find(l => /^Question Difficulty:/i.test(l));
      if (diffLine) difficulty = diffLine.replace(/^Question Difficulty:\s*/i, "").trim();
      const bodyLines = lines.slice(1, answerHeaderIdx);
      const choiceRegex = /^([A-D])[.)]\s+(.+)/;
      const choiceIndices = [];
      bodyLines.forEach((l, i) => { if (choiceRegex.test(l)) choiceIndices.push(i); });
      if (choiceIndices.length < 4) continue;
      const firstChoiceIdx = choiceIndices[0];
      const preChoiceLines = bodyLines.slice(0, firstChoiceIdx);
      let questionIdx = -1;
      for (let _i = preChoiceLines.length - 1; _i >= 0; _i--) {
        const _l = preChoiceLines[_i];
        if (/which choice/i.test(_l) || /which.*following/i.test(_l) || _l.endsWith("?") || _l.endsWith("______")) { questionIdx = _i; break; }
      }
      if (questionIdx === -1) questionIdx = preChoiceLines.length - 1;
      const stimulus = preChoiceLines.slice(0, questionIdx).join(" ").trim();
      const question = preChoiceLines.slice(questionIdx).join(" ").trim() || "Which choice most logically completes the text?";
      const choices = [];
      for (let ci = 0; ci < choiceIndices.length; ci++) {
        const start = choiceIndices[ci];
        const end = ci + 1 < choiceIndices.length ? choiceIndices[ci + 1] : bodyLines.length;
        const choiceText = bodyLines.slice(start, end).join(" ");
        const match = choiceText.match(/^([A-D])[.)]\s+(.+)/);
        if (match) choices.push({ letter: match[1], text: match[2].trim() });
      }
      if (choices.length !== 4) continue;
      questions.push({ id, test:"SAT", section, domain, skill, difficulty, stimulus, question, choices, answer, explanation });
    } catch(e) {}
  }
  return questions;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function useTimer(running) {
  const [secs, setSecs] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(ref.current);
  }, [running]);
  const reset = useCallback(() => setSecs(0), []);
  const fmt = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
  return { secs, fmt: fmt(secs), reset };
}

async function extractTextFromPDF(file) {
  return new Promise((resolve, reject) => {
    if (!window.pdfjsLib) { reject(new Error("PDF.js not loaded")); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(" ") + "\n";
        }
        resolve(fullText);
      } catch(err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const C = {
  root: { fontFamily:"'DM Sans',system-ui,sans-serif", minHeight:"100vh", background:"#0d0d0f", color:"#f0ede8" },
  nav: { position:"fixed", top:0, left:0, right:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 2rem", height:58, background:"rgba(13,13,15,0.92)", backdropFilter:"blur(20px)", borderBottom:"1px solid rgba(255,255,255,0.07)" },
  logo: { display:"flex", alignItems:"center", gap:9, fontWeight:700, fontSize:15, color:"#f0ede8", letterSpacing:"-0.01em" },
  logoMark: { width:28, height:28, background:"linear-gradient(135deg,#f97316,#ea580c)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:13 },
  navRight: { display:"flex", alignItems:"center", gap:8 },
  badge: { fontSize:"0.78rem", color:"#6b7280", background:"rgba(255,255,255,0.05)", padding:"0.3rem 0.75rem", borderRadius:100, border:"1px solid rgba(255,255,255,0.08)" },
  page: { paddingTop:58, minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"4rem 1.5rem" },
  inner: { width:"100%", maxWidth:640, display:"flex", flexDirection:"column", gap:"1.75rem" },
  h1: { fontSize:"clamp(1.75rem,3.5vw,2.4rem)", fontWeight:800, letterSpacing:"-0.03em", lineHeight:1.15, textAlign:"center" },
  sub: { fontSize:"0.9rem", color:"#6b7280", textAlign:"center", fontWeight:300, lineHeight:1.65, marginTop:"0.5rem" },
  statsRow: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.75rem" },
  statBox: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"1rem 1.25rem", textAlign:"center" },
  statN: { fontSize:"1.7rem", fontWeight:800, letterSpacing:"-0.03em", background:"linear-gradient(135deg,#f97316,#ea580c)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
  statL: { fontSize:"0.72rem", color:"#6b7280", marginTop:"0.2rem", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" },
  dropzone: (d) => ({ border:`2px dashed ${d?"#f97316":"rgba(255,255,255,0.1)"}`, borderRadius:20, padding:"3rem 2rem", textAlign:"center", background:d?"rgba(249,115,22,0.05)":"rgba(255,255,255,0.02)", transition:"all 0.2s", cursor:"pointer" }),
  dropIcon: { fontSize:"2.5rem", display:"block", marginBottom:"0.875rem" },
  dropTitle: { fontSize:"1rem", fontWeight:600, marginBottom:"0.35rem" },
  dropSub: { fontSize:"0.825rem", color:"#6b7280", fontWeight:300 },
  fileList: { display:"flex", flexDirection:"column", gap:"0.5rem" },
  fileRow: (s) => ({ display:"flex", alignItems:"center", gap:"0.875rem", background:s==="done"?"rgba(34,197,94,0.05)":s==="error"?"rgba(239,68,68,0.05)":"rgba(255,255,255,0.03)", border:`1px solid ${s==="done"?"rgba(34,197,94,0.18)":s==="error"?"rgba(239,68,68,0.18)":"rgba(255,255,255,0.07)"}`, borderRadius:11, padding:"0.7rem 1rem", transition:"all 0.2s" }),
  fileName: { flex:1, fontSize:"0.82rem", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#d1d5db" },
  fileStatusText: (s) => ({ fontSize:"0.76rem", fontWeight:700, color:s==="done"?"#22c55e":s==="error"?"#ef4444":s==="parsing"?"#f97316":"#4b5563", flexShrink:0 }),
  btnPrimary: { background:"linear-gradient(135deg,#f97316,#ea580c)", color:"white", border:"none", padding:"0.875rem 2rem", borderRadius:12, fontSize:"0.95rem", fontWeight:700, cursor:"pointer", fontFamily:"inherit", width:"100%", letterSpacing:"-0.01em", transition:"all 0.15s", boxShadow:"0 4px 24px rgba(249,115,22,0.25)" },
  btnSec: { background:"rgba(255,255,255,0.06)", color:"#f0ede8", border:"1px solid rgba(255,255,255,0.1)", padding:"0.625rem 1.25rem", borderRadius:10, fontSize:"0.85rem", fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" },
  // Config
  configPage: { paddingTop:58, maxWidth:660, margin:"0 auto", padding:"72px 1.5rem 3rem" },
  card: { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:"1.25rem 1.5rem" },
  sectionLabel: { fontSize:"0.7rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:"#6b7280", marginBottom:"0.875rem" },
  pillRow: { display:"flex", flexWrap:"wrap", gap:"0.5rem" },
  pill: (a) => ({ padding:"0.38rem 0.875rem", borderRadius:100, border:`1.5px solid ${a?"#f97316":"rgba(255,255,255,0.09)"}`, background:a?"rgba(249,115,22,0.12)":"rgba(255,255,255,0.03)", fontSize:"0.8rem", fontWeight:500, cursor:"pointer", color:a?"#f97316":"#9ca3af", transition:"all 0.12s", userSelect:"none", whiteSpace:"nowrap" }),
  diffBtn: (d,a) => ({ flex:1, padding:"0.7rem", border:`1.5px solid ${a?(d==="Easy"?"#22c55e":d==="Hard"?"#ef4444":"#f97316"):"rgba(255,255,255,0.08)"}`, background:a?(d==="Easy"?"rgba(34,197,94,0.08)":d==="Hard"?"rgba(239,68,68,0.08)":"rgba(249,115,22,0.08)"):"rgba(255,255,255,0.02)", color:a?(d==="Easy"?"#22c55e":d==="Hard"?"#ef4444":"#f97316"):"#6b7280", borderRadius:10, fontSize:"0.875rem", fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }),
  // Practice
  practicePage: { paddingTop:58, maxWidth:760, margin:"0 auto", padding:"72px 1.5rem 3rem" },
  qHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"0.75rem" },
  tag: (color) => ({ display:"inline-flex", alignItems:"center", background:`rgba(${color},0.12)`, border:`1px solid rgba(${color},0.25)`, color:`rgb(${color})`, fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", padding:"0.22rem 0.6rem", borderRadius:6 }),
  progressBar: { width:100, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" },
  progressFill: (pct) => ({ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#f97316,#ea580c)", borderRadius:2, transition:"width 0.3s" }),
  timer: { fontFamily:"monospace", fontSize:"1rem", fontWeight:700 },
  stimulus: { fontSize:"0.92rem", lineHeight:1.8, color:"#d1d5db", background:"rgba(255,255,255,0.025)", borderRadius:12, padding:"1.25rem 1.5rem", border:"1px solid rgba(255,255,255,0.06)", fontWeight:300 },
  question: { fontSize:"1rem", fontWeight:600, lineHeight:1.65 },
  choice: (s) => ({ display:"flex", alignItems:"flex-start", gap:"0.875rem", padding:"0.875rem 1rem", border:`1.5px solid ${s==="correct"?"#22c55e":s==="wrong"?"#ef4444":s==="selected"?"#f97316":"rgba(255,255,255,0.08)"}`, borderRadius:12, background:s==="correct"?"rgba(34,197,94,0.07)":s==="wrong"?"rgba(239,68,68,0.07)":s==="selected"?"rgba(249,115,22,0.07)":"rgba(255,255,255,0.02)", cursor:s==="correct"||s==="wrong"?"default":"pointer", transition:"all 0.15s" }),
  choiceLetter: (s) => ({ width:28, height:28, borderRadius:7, flexShrink:0, marginTop:2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.78rem", fontWeight:700, fontFamily:"monospace", background:s==="correct"?"#22c55e":s==="wrong"?"#ef4444":s==="selected"?"#f97316":"rgba(255,255,255,0.07)", color:s!=="neutral"?"white":"#6b7280" }),
  choiceText: { fontSize:"0.88rem", lineHeight:1.6, paddingTop:3 },
  explanation: { background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.18)", borderRadius:12, padding:"1.1rem 1.4rem", fontSize:"0.86rem", lineHeight:1.75, color:"#d1d5db", fontWeight:300 },
  expLabel: { fontWeight:700, color:"#22c55e", fontSize:"0.72rem", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"0.5rem" },
  actRow: { display:"flex", gap:"0.75rem", flexWrap:"wrap" },
  btnAct: (p) => ({ flex:p?1:"none", background:p?"linear-gradient(135deg,#f97316,#ea580c)":"rgba(255,255,255,0.06)", color:p?"white":"#f0ede8", border:p?"none":"1px solid rgba(255,255,255,0.1)", padding:"0.75rem 1.5rem", borderRadius:11, fontSize:"0.875rem", fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }),
  scoreTracker: { display:"flex", gap:"1rem", padding:"0.7rem 1rem", background:"rgba(255,255,255,0.03)", borderRadius:10, border:"1px solid rgba(255,255,255,0.06)", alignItems:"center" },
  // Results
  resultPage: { paddingTop:58, maxWidth:480, margin:"0 auto", padding:"72px 1.5rem 3rem" },
  resultCard: { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"2.5rem", textAlign:"center" },
  resultScore: { fontSize:"4rem", fontWeight:900, letterSpacing:"-0.04em", background:"linear-gradient(135deg,#f97316,#ea580c)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
  resultGrid: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.875rem", marginTop:"1.75rem" },
  rStat: { background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"1rem 0.75rem" },
  rStatN: { fontSize:"1.6rem", fontWeight:800, letterSpacing:"-0.02em" },
  rStatL: { fontSize:"0.72rem", color:"#6b7280", marginTop:"0.2rem" },
};

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [allQ, setAllQ] = useState([]);
  const [view, setView] = useState("import");
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const fileInputRef = useRef();

  // Practice state
  const [config, setConfig] = useState({ skills:[], difficulties:["Easy","Medium","Hard"], doShuffle:true });
  const [queue, setQueue] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [results, setResults] = useState([]);
  const { secs, fmt:timerFmt, reset:resetTimer } = useTimer(view==="practice" && !revealed);

  // Load PDF.js
  useEffect(() => {
    if (window.pdfjsLib) { setPdfReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setPdfReady(true);
    };
    document.head.appendChild(s);
  }, []);

  const saveQ = useCallback((qs) => {
    setAllQ(qs);
  }, []);

  const processFiles = useCallback(async (rawFiles) => {
    if (!pdfReady) { alert("PDF reader still loading, please wait a moment."); return; }
    const fileArr = Array.from(rawFiles).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (!fileArr.length) return;
    setFiles(prev => [...prev, ...fileArr.map(f => ({ name:f.name, status:"pending", count:0 }))]);
    let added = [];
    for (const file of fileArr) {
      setFiles(prev => prev.map(e => e.name===file.name ? {...e, status:"parsing"} : e));
      try {
        const text = await extractTextFromPDF(file);
        const parsed = parsePDFText(text, file.name);
        added = [...added, ...parsed];
        setFiles(prev => prev.map(e => e.name===file.name ? {...e, status:parsed.length>0?"done":"error", count:parsed.length} : e));
      } catch(e) {
        setFiles(prev => prev.map(e => e.name===file.name ? {...e, status:"error"} : e));
      }
    }
    if (added.length > 0) {
      setAllQ(prev => {
        const ids = new Set(prev.map(q => q.id));
        const next = [...prev, ...added.filter(q => !ids.has(q.id))];
        return next;
      });
    }
  }, [pdfReady]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const skills = [...new Set(allQ.map(q => q.skill))].sort();
  const filteredQ = allQ.filter(q =>
    (config.skills.length===0 || config.skills.includes(q.skill)) &&
    config.difficulties.includes(q.difficulty)
  );

  function startPractice() {
    if (!filteredQ.length) return;
    const q = config.doShuffle ? shuffle(filteredQ) : filteredQ;
    setQueue(q); setQIdx(0); setSelected(null); setRevealed(false); setShowExp(false); setResults([]); resetTimer();
    setView("practice");
  }

  function submit() {
    if (!selected || revealed) return;
    setRevealed(true);
    setResults(prev => [...prev, { correct: selected===queue[qIdx].answer, timeSecs:secs }]);
  }

  function next() {
    if (qIdx+1 >= queue.length) { setView("results"); return; }
    setQIdx(i => i+1); setSelected(null); setRevealed(false); setShowExp(false); resetTimer();
  }

  function choiceState(letter) {
    if (!revealed) return selected===letter ? "selected" : "neutral";
    if (letter===queue[qIdx].answer) return "correct";
    if (letter===selected) return "wrong";
    return "neutral";
  }

  const correct = results.filter(r => r.correct).length;

  // ── IMPORT ──
  if (view === "import") return (
    <div style={C.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800&display=swap" rel="stylesheet"/>
      <nav style={C.nav}>
        <div style={C.logo}><div style={C.logoMark}>S</div>SATQuestionBank</div>
        <div style={C.navRight}>
          {allQ.length > 0 && <span style={C.badge}>{allQ.length} questions</span>}
          {allQ.length > 0 && <button style={C.btnSec} onClick={() => setView("config")}>Practice →</button>}
        </div>
      </nav>
      <div style={C.page}>
        <div style={C.inner}>
          <div>
            <div style={C.h1}>Drop your PDFs.<br/>Build your bank.</div>
            <div style={C.sub}>Upload College Board SAT question PDFs — they'll be parsed,<br/>categorized, and saved automatically to your browser.</div>
          </div>

          {allQ.length > 0 && (
            <div style={C.statsRow}>
              <div style={C.statBox}><div style={C.statN}>{allQ.length}</div><div style={C.statL}>Questions</div></div>
              <div style={C.statBox}><div style={C.statN}>{skills.length}</div><div style={C.statL}>Skills</div></div>
              <div style={C.statBox}><div style={C.statN}>{[...new Set(allQ.map(q=>q.domain))].length}</div><div style={C.statL}>Domains</div></div>
            </div>
          )}

          <div
            style={C.dropzone(dragging)}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{display:"none"}} onChange={e => processFiles(e.target.files)}/>
            <span style={C.dropIcon}>{pdfReady ? "📄" : "⏳"}</span>
            <div style={C.dropTitle}>{pdfReady ? "Drop PDFs here, or click to browse" : "Loading PDF reader…"}</div>
            <div style={C.dropSub}>Multiple files at once · College Board SAT question bank format</div>
          </div>

          {files.length > 0 && (
            <div style={C.fileList}>
              {files.map((f,i) => (
                <div key={i} style={C.fileRow(f.status)}>
                  <span style={{fontSize:"1.1rem",flexShrink:0}}>{f.status==="done"?"✅":f.status==="error"?"❌":f.status==="parsing"?"⚙️":"📄"}</span>
                  <span style={C.fileName}>{f.name}</span>
                  <span style={C.fileStatusText(f.status)}>{f.status==="done"?`${f.count} Qs`:f.status==="error"?"Error":f.status==="parsing"?"Parsing…":"Queued"}</span>
                </div>
              ))}
            </div>
          )}

          {allQ.length > 0 && (
            <button style={C.btnPrimary} onClick={() => setView("config")}>
              Start Practicing · {allQ.length} questions →
            </button>
          )}

          {allQ.length > 0 && (
            <div style={{textAlign:"center"}}>
              <button
                style={{background:"none",border:"none",color:"#4b5563",fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}
                onClick={() => { if(window.confirm("Clear all saved questions?")) { saveQ([]); setFiles([]); } }}
              >Clear all questions</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── CONFIG ──
  if (view === "config") return (
    <div style={C.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <nav style={C.nav}>
        <div style={C.logo}><div style={C.logoMark}>S</div>SATQuestionBank</div>
        <div style={C.navRight}>
          <button style={C.btnSec} onClick={() => setView("import")}>← Import More</button>
        </div>
      </nav>
      <div style={C.configPage}>
        <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
          <div>
            <div style={{fontSize:"1.8rem",fontWeight:800,letterSpacing:"-0.03em",marginBottom:"0.3rem"}}>Configure session</div>
            <div style={{color:"#6b7280",fontSize:"0.875rem",fontWeight:300}}>{filteredQ.length} questions match your filters</div>
          </div>

          <div style={C.card}>
            <div style={C.sectionLabel}>Skills</div>
            <div style={C.pillRow}>
              <div style={C.pill(config.skills.length===0)} onClick={() => setConfig(c=>({...c,skills:[]}))}>All skills</div>
              {skills.map(s => (
                <div key={s} style={C.pill(config.skills.includes(s))}
                  onClick={() => setConfig(c => ({ ...c, skills: c.skills.includes(s) ? c.skills.filter(x=>x!==s) : [...c.skills,s] }))}>
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div style={C.card}>
            <div style={C.sectionLabel}>Difficulty</div>
            <div style={{display:"flex",gap:"0.75rem"}}>
              {["Easy","Medium","Hard"].map(d => (
                <button key={d} style={C.diffBtn(d,config.difficulties.includes(d))}
                  onClick={() => setConfig(c => ({ ...c, difficulties: c.difficulties.includes(d) ? c.difficulties.filter(x=>x!==d) : [...c.difficulties,d] }))}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div style={C.card}>
            <div style={C.sectionLabel}>Options</div>
            <div style={C.pillRow}>
              <div style={C.pill(config.doShuffle)} onClick={() => setConfig(c=>({...c,doShuffle:!c.doShuffle}))}>🔀 Shuffle questions</div>
            </div>
          </div>

          <button style={{...C.btnPrimary,opacity:filteredQ.length===0?0.4:1}} onClick={startPractice} disabled={filteredQ.length===0}>
            Start Practice · {filteredQ.length} questions →
          </button>
        </div>
      </div>
    </div>
  );

  // ── RESULTS ──
  if (view === "results") return (
    <div style={C.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <nav style={C.nav}>
        <div style={C.logo}><div style={C.logoMark}>S</div>SATQuestionBank</div>
      </nav>
      <div style={C.resultPage}>
        <div style={C.resultCard}>
          <div style={{fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#6b7280",marginBottom:"1rem"}}>Session Complete</div>
          <div style={C.resultScore}>{Math.round((correct/results.length)*100)}%</div>
          <div style={{color:"#6b7280",fontSize:"0.9rem",marginTop:"0.4rem"}}>{correct} of {results.length} correct</div>
          <div style={C.resultGrid}>
            <div style={C.rStat}><div style={{...C.rStatN,color:"#22c55e"}}>{correct}</div><div style={C.rStatL}>Correct</div></div>
            <div style={C.rStat}><div style={{...C.rStatN,color:"#ef4444"}}>{results.length-correct}</div><div style={C.rStatL}>Incorrect</div></div>
            <div style={C.rStat}><div style={{...C.rStatN,color:"#f97316"}}>{Math.round(results.reduce((a,r)=>a+r.timeSecs,0)/results.length)}s</div><div style={C.rStatL}>Avg. time</div></div>
          </div>
          <div style={{display:"flex",gap:"0.75rem",marginTop:"2rem"}}>
            <button style={{...C.btnAct(false),flex:1}} onClick={() => setView("config")}>New Session</button>
            <button style={{...C.btnAct(true),flex:1}} onClick={startPractice}>Retry</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── PRACTICE ──
  const q = queue[qIdx];
  if (!q) return null;

  return (
    <div style={C.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <nav style={C.nav}>
        <div style={C.logo}><div style={C.logoMark}>S</div>SATQuestionBank</div>
        <div style={C.navRight}>
          <span style={C.badge}>{qIdx+1} / {queue.length}</span>
          <button style={C.btnSec} onClick={() => setView("config")}>Exit</button>
        </div>
      </nav>
      <div style={C.practicePage}>
        <div style={{display:"flex",flexDirection:"column",gap:"1.4rem"}}>

          <div style={C.qHeader}>
            <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",alignItems:"center"}}>
              <span style={C.tag("249,115,22")}>{q.skill}</span>
              <span style={C.tag(q.difficulty==="Easy"?"34,197,94":q.difficulty==="Hard"?"239,68,68":"249,115,22")}>{q.difficulty}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"0.875rem"}}>
              <div style={C.progressBar}><div style={C.progressFill(((qIdx+1)/queue.length)*100)}/></div>
              <span style={C.timer}>{timerFmt}</span>
            </div>
          </div>

          {q.stimulus?.trim() && <div style={C.stimulus}>{q.stimulus}</div>}

          <div style={C.question}>{q.question}</div>

          <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
            {q.choices.map(c => (
              <div key={c.letter} style={C.choice(choiceState(c.letter))} onClick={() => { if (!revealed) setSelected(c.letter); }}>
                <div style={C.choiceLetter(choiceState(c.letter))}>{c.letter}</div>
                <div style={C.choiceText}>{c.text}</div>
              </div>
            ))}
          </div>

          {showExp && q.explanation && (
            <div style={C.explanation}>
              <div style={C.expLabel}>Explanation</div>
              {q.explanation}
            </div>
          )}

          <div style={C.actRow}>
            {!revealed ? (
              <button style={{...C.btnAct(true),opacity:selected?1:0.4}} onClick={submit} disabled={!selected}>
                Submit Answer
              </button>
            ) : (
              <>
                {q.explanation && (
                  <button style={C.btnAct(false)} onClick={() => setShowExp(s=>!s)}>
                    {showExp?"Hide":"Show"} Explanation
                  </button>
                )}
                <button style={C.btnAct(true)} onClick={next}>
                  {qIdx+1>=queue.length ? "See Results" : "Next →"}
                </button>
              </>
            )}
          </div>

          {results.length > 0 && (
            <div style={C.scoreTracker}>
              <span style={{fontSize:"0.78rem",color:"#6b7280"}}>Score:</span>
              <span style={{fontSize:"0.78rem",color:"#22c55e",fontWeight:700}}>✓ {correct}</span>
              <span style={{fontSize:"0.78rem",color:"#ef4444",fontWeight:700}}>✗ {results.length-correct}</span>
              <span style={{fontSize:"0.78rem",color:"#6b7280"}}>{Math.round((correct/results.length)*100)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
