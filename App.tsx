import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Participant, Winner, AppState, Prize } from './types';
import { generateCelebrationMessage } from './geminiService';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, onValue, set, update, push, child, get } from "firebase/database";
import { 
  Users, 
  Trash2, 
  Trophy, 
  Play, 
  RotateCcw, 
  FileSpreadsheet, 
  Sparkles,
  Gift,
  Eraser,
  Download,
  UserPlus,
  PackagePlus,
  Hash,
  HelpCircle,
  Armchair,
  CheckCircle2,
  Circle,
  ListOrdered,
  CheckSquare,
  Square
} from 'lucide-react';

const App: React.FC = () => {
  // --- State Management ---
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [selectedPrizeId, setSelectedPrizeId] = useState<string>('');
  const [winners, setWinners] = useState<Winner[]>([]);
  const [currentState, setCurrentState] = useState<AppState>(AppState.IDLE);
  const [currentWinner, setCurrentWinner] = useState<Winner | null>(null);
  const [batchWinners, setBatchWinners] = useState<Winner[]>([]); // For current drawing animation

  // --- UI/Animation State ---
  const rollingNameRef = useRef<HTMLDivElement>(null);
  const rollingTableRef = useRef<HTMLSpanElement>(null);
  const drawCountRef = useRef<number>(1);
  const [showInfo, setShowInfo] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [customDrawCount, setCustomDrawCount] = useState<number>(1);
  const isResettingRef = useRef(false);

  // --- Winners List UI State ---
  const [activeTabTimestamp, setActiveTabTimestamp] = useState<number>(0);
  const prevGroupLengthRef = useRef(0);

  // --- Input State ---
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddPrize, setShowAddPrize] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTable, setNewTable] = useState('');
  const [newPrizeName, setNewPrizeName] = useState('');
  const [newPrizeCount, setNewPrizeCount] = useState(1);

  const fileInputRefParticipants = useRef<HTMLInputElement>(null);
  const fileInputRefPrizes = useRef<HTMLInputElement>(null);

  // --- Firebase Synchronization ---
  
  // Listen to Database Changes
  useEffect(() => {
    const participantsRef = ref(db, 'participants');
    const prizesRef = ref(db, 'prizes');
    const winnersRef = ref(db, 'winners');
    const appStateRef = ref(db, 'appState');
    const currentBatchRef = ref(db, 'currentBatch'); // Sync current drawing result for everyone

    const unsubP = onValue(participantsRef, (snapshot) => {
      setParticipants(snapshot.val() || []);
    });
    
    const unsubPr = onValue(prizesRef, (snapshot) => {
      setPrizes(snapshot.val() || []);
    });

    const unsubW = onValue(winnersRef, (snapshot) => {
      setWinners(snapshot.val() || []);
    });
    
    // Optional: Sync App State if you want all screens to change mode together
    // For now, we only sync data to avoid messing up the drawer's animation flow on other clients
    
    return () => {
      unsubP();
      unsubPr();
      unsubW();
    };
  }, []);

  // --- Helpers to Update Firebase ---
  
  const updateFirebase = (path: string, data: any) => {
    set(ref(db, path), data);
  };

  // --- Logic ---

  // Group Winners by Batches (Time based clustering)
  const groupedWinners = useMemo(() => {
    if (winners.length === 0) return [];
    
    // Sort descending by time (Newest first)
    const sorted = [...winners].sort((a, b) => b.drawnAt - a.drawnAt);
    
    const groups: { timestamp: number, items: Winner[] }[] = [];
    let currentBatch: Winner[] = [];
    
    if (sorted.length > 0) {
        let batchTime = sorted[0].drawnAt;
        sorted.forEach((w) => {
            // Strictly group by exact timestamp ID since we generate them together
            if (w.drawnAt !== batchTime) {
                groups.push({ timestamp: batchTime, items: currentBatch });
                currentBatch = [];
                batchTime = w.drawnAt;
            }
            currentBatch.push(w);
        });
        if (currentBatch.length > 0) {
            groups.push({ timestamp: batchTime, items: currentBatch });
        }
    }
    
    return groups;
  }, [winners]);

  // Generate labels for batches
  const batchLabels = useMemo(() => {
    const labels = new Map<number, string>();
    const prizeCounts: Record<string, number> = {};

    // Iterate Oldest to Newest to count occurrences
    [...groupedWinners].reverse().forEach(group => {
      if (group.items.length === 0) return;
      const prizeName = group.items[0].prizeName;
      prizeCounts[prizeName] = (prizeCounts[prizeName] || 0) + 1;
      const count = prizeCounts[prizeName];
      const label = `${prizeName} (${count})`; // Always show count for clarity
      labels.set(group.timestamp, label);
    });

    return labels;
  }, [groupedWinners]);

  // Auto-switch tab when a new batch arrives (only if on default view)
  useEffect(() => {
    if (groupedWinners.length > prevGroupLengthRef.current) {
        if (groupedWinners.length > 0) {
            setActiveTabTimestamp(groupedWinners[0].timestamp);
        }
    }
    prevGroupLengthRef.current = groupedWinners.length;
  }, [groupedWinners.length]);

  const activeGroup = useMemo(() => {
    if (groupedWinners.length === 0) return null;
    return groupedWinners.find(g => g.timestamp === activeTabTimestamp) || groupedWinners[0];
  }, [groupedWinners, activeTabTimestamp]);

  // Fix: Event delegation for reset winners button
  useEffect(() => {
    const handleResetClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="reset-winners"]')) {
        if (window.confirm('確定要清除所有得獎紀錄嗎？此動作無法復原。')) {
          updateFirebase('winners', []);
        }
      }
    };
    document.body.addEventListener('click', handleResetClick);
    return () => document.body.removeEventListener('click', handleResetClick);
  }, []);

  const selectedPrize = useMemo(() => prizes.find(p => p.id === selectedPrizeId), [prizes, selectedPrizeId]);

  // --- Action Handlers ---

  const manualAddParticipant = () => {
    if (!newName.trim()) return;
    const newEntry: Participant = {
      id: Math.random().toString(36).substring(2, 11),
      name: newName.trim(),
      tableNumber: newTable.trim(),
      addedAt: Date.now()
    };
    updateFirebase('participants', [...participants, newEntry]);
    setNewName('');
    setNewTable('');
  };

  const handleClearParticipants = () => {
    if (window.confirm('⚠️ 警告：確定要清空所有參加者名單嗎？\n此動作無法復原！')) {
        updateFirebase('participants', []);
    }
  };

  const manualAddPrize = () => {
    if (!newPrizeName.trim()) return;
    const newEntry: Prize = {
      id: Math.random().toString(36).substring(2, 11),
      name: newPrizeName.trim(),
      count: newPrizeCount
    };
    updateFirebase('prizes', [...prizes, newEntry]);
    setNewPrizeName('');
    setNewPrizeCount(1);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'participants' | 'prizes') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const workbook = XLSX.read(bstr, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      if (type === 'participants') {
        const newEntries: Participant[] = data.slice(1).map(row => ({
          id: Math.random().toString(36).substr(2, 9),
          name: String(row[0] || '').trim(),
          tableNumber: String(row[1] || '').trim(),
          addedAt: Date.now()
        })).filter(p => p.name);
        updateFirebase('participants', [...participants, ...newEntries]);
      } else {
        const newEntries: Prize[] = data.slice(1).map(row => ({
          id: Math.random().toString(36).substr(2, 9),
          name: String(row[0] || '').trim(),
          count: parseInt(String(row[1] || '1')) || 1
        })).filter(p => p.name);
        updateFirebase('prizes', [...prizes, ...newEntries]);
      }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleGlobalReset = () => {
    if (window.confirm('⚠️ 系統重置警告 ⚠️\n\n此動作將「完全清除」雲端與本地所有資料：\n\n1. 所有參加人名單\n2. 所有獎品設定\n3. 所有中獎紀錄\n\n確定要執行嗎？')) {
      isResettingRef.current = true;
      set(ref(db, '/'), {
          participants: [],
          prizes: [],
          winners: []
      }).then(() => {
          window.location.reload();
      });
    }
  };

  const handleDeletePrize = (e: React.MouseEvent, prizeId: string) => {
    e.stopPropagation();
    if (window.confirm('確定要刪除此獎項嗎？')) {
      const newPrizes = prizes.filter(p => p.id !== prizeId);
      updateFirebase('prizes', newPrizes);
      if (selectedPrizeId === prizeId) setSelectedPrizeId('');
    }
  };

  const toggleVerification = (winnerId: string) => {
    const updatedWinners = winners.map(w => 
      w.id === winnerId ? { ...w, verified: !w.verified } : w
    );
    updateFirebase('winners', updatedWinners);
  };

  const exportWinners = () => {
    if (winners.length === 0) return alert('目前沒有中獎紀錄！');
    const data = winners.map(w => ({
      '姓名': w.name,
      '桌次': w.tableNumber || '',
      '獎項': w.prizeName,
      '狀態': w.verified ? '已領獎' : '未領獎',
      '時間': new Date(w.drawnAt).toLocaleString(),
      'AI 賀詞': w.aiMessage || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "中獎紅榜");
    XLSX.writeFile(workbook, `英雄摸彩名單_${Date.now()}.xlsx`);
  };

  // --- Core Drawing Logic ---

  const finalizeDraw = useCallback(async (drawCount: number) => {
    const candidates = [...participants];
    const luckies: Participant[] = [];
    
    // Safety check
    if (candidates.length < drawCount) {
        alert('抽獎過程中參加者數量發生變化，請重新操作。');
        setCurrentState(AppState.IDLE);
        return;
    }

    for (let i = 0; i < drawCount; i++) {
      const idx = Math.floor(Math.random() * candidates.length);
      luckies.push(candidates.splice(idx, 1)[0]);
    }

    // Capture single unified timestamp for the batch to ensure grouping works
    const batchTimestamp = Date.now();

    // @ts-ignore
    if(window.confetti) window.confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 }, colors: ['#ffd700', '#ff0000', '#ffffff'] });

    // 1. Generate results
    const newWinners: Winner[] = luckies.map((lucky) => ({
      id: lucky.id,
      name: lucky.name,
      tableNumber: lucky.tableNumber,
      prizeName: selectedPrize?.name || '神秘獎品',
      drawnAt: batchTimestamp,
      aiMessage: "恭喜獲獎，好運龍總來！",
      verified: false
    }));

    // Sort by table number for better reading
    newWinners.sort((a, b) => {
        const tA = a.tableNumber || '';
        const tB = b.tableNumber || '';
        return tA.localeCompare(tB, undefined, { numeric: true, sensitivity: 'base' });
    });

    // 2. Update Local UI for Animation
    setIsAILoading(false);
    if (drawCount === 1) setCurrentWinner(newWinners[0]);
    else setBatchWinners(newWinners);

    setCurrentState(AppState.WINNER_REVEALED);

    // 3. Sync to Firebase (Atomic update to prevent race conditions)
    // We update Winners, Participants (remove lucky ones), and Prizes (decrement count)
    const updates: any = {};
    updates['winners'] = [...winners, ...newWinners];
    updates['participants'] = candidates; // 'candidates' is the array with lucky ones removed
    
    // Update Prize Count
    const updatedPrizes = prizes.map(p => 
        p.id === selectedPrize?.id ? { ...p, count: Math.max(0, p.count - drawCount) } : p
    );
    updates['prizes'] = updatedPrizes;
    
    // Execute DB Update
    await update(ref(db), updates);

    // 4. Background AI Fetch
    if (drawCount <= 5) {
         newWinners.forEach(async (winner) => {
             try {
                 const msg = await generateCelebrationMessage(winner.name);
                 // Need to fetch latest winners to update specific item
                 // Since we use Firebase, we should fetch current DB winners state or use prev state logic
                 // For simplicity, we trigger a specific update for this winner in Firebase
                 const winnersRef = ref(db, 'winners');
                 // Note: This is inefficient (O(N)), but safe for small datasets
                 // A better way is to use a keyed object for winners in Firebase
                 get(winnersRef).then((snap) => {
                     const currentWinners = snap.val() as Winner[];
                     const updated = currentWinners.map(w => w.id === winner.id ? {...w, aiMessage: msg} : w);
                     set(winnersRef, updated);
                 });
             } catch (e) { console.error(e); }
         });
    }

  }, [participants, selectedPrize, prizes, winners]);

  const startDraw = async (drawCount: number) => {
    if (!selectedPrize) return alert('請先選擇一個獎項！');
    if (drawCount < 1) return alert('抽取人數至少為 1 位！');
    if (participants.length < drawCount) return alert(`目前參加者剩餘 ${participants.length} 位，不足抽出 ${drawCount} 位！`);
    if (selectedPrize.count < drawCount) return alert(`獎項剩餘 ${selectedPrize.count} 份，不足抽出 ${drawCount} 位！`);

    drawCountRef.current = drawCount;
    setCurrentWinner(null);
    setBatchWinners([]);
    setCurrentState(AppState.DRAWING);
  };

  // Animation Loop
  useEffect(() => {
    if (currentState === AppState.DRAWING) {
        const duration = 3000;
        const intervalTime = 60; 
        const endTime = Date.now() + duration;

        const interval = setInterval(() => {
            if (Date.now() >= endTime) {
                clearInterval(interval);
                finalizeDraw(drawCountRef.current);
            } else {
                if (participants.length > 0) {
                    const randomP = participants[Math.floor(Math.random() * participants.length)];
                    if (rollingNameRef.current) rollingNameRef.current.textContent = randomP.name;
                    if (rollingTableRef.current) rollingTableRef.current.textContent = randomP.tableNumber || '??';
                }
            }
        }, intervalTime);
        return () => clearInterval(interval);
    }
  }, [currentState, participants, finalizeDraw]);

  return (
    <div className="min-h-screen bg-[#2d0202] text-slate-100 font-['Noto_Sans_TC'] selection:bg-amber-500/30 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-5 flex justify-around">
        {[...Array(6)].map((_, i) => <div key={i} className="h-full w-px bg-amber-500"></div>)}
      </div>

      <div className="p-4 md:p-8 w-full max-w-[95%] mx-auto relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-amber-500/20 shadow-2xl">
          <div className="flex items-center gap-5">
            <div className="bg-gradient-to-br from-red-600 to-red-900 p-4 rounded-3xl border border-amber-400/30 shadow-lg">
              <Trophy className="w-10 h-10 text-amber-200" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 bg-clip-text text-transparent italic tracking-tight whitespace-nowrap">
                千軍萬馬來相見
              </h1>
              <p className="text-[10px] text-amber-500/60 mt-1 font-black tracking-[0.5em] uppercase">Lucky Draw System</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowInfo(true)} className="p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 transition-all"><HelpCircle className="w-6 h-6" /></button>
            <button 
              onClick={handleGlobalReset} 
              className="p-4 rounded-2xl bg-red-950/60 hover:bg-red-800 border border-red-500/30 text-red-100 transition-all active:scale-95 shadow-lg flex items-center gap-2"
            >
              <RotateCcw className="w-6 h-6" />
              <span className="font-bold text-sm hidden md:inline">系統重置</span>
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          {/* Left Column: Admin / Setup (Hidden on Mobile usually, but we keep it responsive) */}
          <aside className="lg:col-span-3 space-y-6">
            {/* Participants */}
            <div className="bg-black/40 backdrop-blur-md rounded-[2.5rem] p-6 border border-amber-500/10 shadow-xl flex flex-col h-[500px]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-black flex items-center gap-2 text-amber-400 italic"><Users className="w-6 h-6" /> 參加人 ({participants.length})</h2>
                <div className="flex gap-2">
                  <button onClick={handleClearParticipants} className="p-2 bg-red-950/40 rounded-xl text-red-400 hover:bg-red-900/60 transition-all" title="清空名單"><Trash2 className="w-5 h-5" /></button>
                  <button onClick={() => setShowAddUser(!showAddUser)} className="p-2 bg-amber-500/20 rounded-xl text-amber-400 hover:bg-amber-500/30" title="手動新增"><UserPlus className="w-5 h-5" /></button>
                  <button onClick={() => fileInputRefParticipants.current?.click()} className="p-2 bg-amber-500/20 rounded-xl text-amber-400 hover:bg-amber-500/30" title="Excel 匯入"><FileSpreadsheet className="w-5 h-5" /></button>
                </div>
                <input type="file" ref={fileInputRefParticipants} onChange={(e) => handleExcelImport(e, 'participants')} className="hidden" accept=".xlsx,.xls" />
              </div>

              {showAddUser && (
                <div className="mb-4 space-y-2 p-3 bg-amber-500/5 rounded-2xl border border-amber-500/20 animate-fade-in shrink-0">
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="姓名" className="w-full bg-black/40 border border-amber-500/20 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-amber-500" />
                  <input type="text" value={newTable} onChange={e => setNewTable(e.target.value)} placeholder="桌次" className="w-full bg-black/40 border border-amber-500/20 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                  <button onClick={() => { manualAddParticipant(); setShowAddUser(false); }} className="w-full bg-amber-500 text-red-950 py-1.5 rounded-xl font-bold text-sm hover:bg-amber-400">確認</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl border transition-all bg-white/5 border-transparent hover:border-amber-500/20 group">
                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex justify-between items-center">
                          <div className="text-sm font-bold text-amber-100 truncate">{p.name}</div>
                          {p.tableNumber && <div className="text-[10px] text-amber-500/60 font-bold flex items-center gap-0.5"><Armchair className="w-3 h-3" /> {p.tableNumber}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prizes */}
            <div className="bg-black/40 backdrop-blur-md rounded-[2.5rem] p-6 border border-amber-500/10 shadow-xl flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-black flex items-center gap-2 text-red-400 italic"><Gift className="w-6 h-6" /> 獎品 ({prizes.length})</h2>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddPrize(!showAddPrize)} className="p-2 bg-red-500/20 rounded-xl text-red-400 hover:bg-red-500/30"><PackagePlus className="w-5 h-5" /></button>
                  <button onClick={() => fileInputRefPrizes.current?.click()} className="p-2 bg-red-500/20 rounded-xl text-red-400 hover:bg-red-500/30"><FileSpreadsheet className="w-5 h-5" /></button>
                </div>
                <input type="file" ref={fileInputRefPrizes} onChange={(e) => handleExcelImport(e, 'prizes')} className="hidden" accept=".xlsx,.xls" />
              </div>
              {showAddPrize && (
                <div className="mb-4 space-y-2 p-3 bg-red-500/5 rounded-2xl border border-red-500/20 animate-fade-in shrink-0">
                  <input type="text" value={newPrizeName} onChange={e => setNewPrizeName(e.target.value)} placeholder="獎品名稱" className="w-full bg-black/40 border border-red-500/20 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-red-500" />
                  <div className="flex items-center gap-2 bg-black/40 border border-red-500/20 rounded-xl px-3 py-2">
                    <span className="text-xs text-red-400/60 font-bold uppercase">數量:</span>
                    <input type="number" value={newPrizeCount} onChange={e => setNewPrizeCount(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 bg-transparent text-sm text-white outline-none" />
                  </div>
                  <button onClick={() => { manualAddPrize(); setShowAddPrize(false); }} className="w-full bg-red-600 text-white py-1.5 rounded-xl font-bold text-sm hover:bg-red-500">確認</button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                {prizes.map(pr => (
                  <div 
                    key={pr.id} 
                    onClick={() => setSelectedPrizeId(pr.id)}
                    className={`flex items-center gap-3 p-3 rounded-[1.5rem] border cursor-pointer transition-all group ${selectedPrizeId === pr.id ? 'bg-red-700/40 border-amber-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
                  >
                    <input type="radio" name="prize" checked={selectedPrizeId === pr.id} readOnly className="accent-amber-500 w-4 h-4 shrink-0 pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-black text-amber-100 flex justify-between items-center">
                        <span className="truncate mr-2">{pr.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="bg-black/40 rounded-lg px-2 py-1 border border-amber-500/20 flex items-center">
                            <Hash className="w-3 h-3 text-amber-500" />
                            <span className="w-8 text-amber-100 font-black text-xs text-center">{pr.count}</span>
                          </div>
                          <button onClick={(e) => handleDeletePrize(e, pr.id)} className="text-red-500/40 p-1 hover:text-red-500 hover:bg-red-950/50 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Center Column: Main Draw Stage */}
          <section className="lg:col-span-9 flex flex-col gap-6">
            <div className="bg-gradient-to-b from-black/60 to-black/40 backdrop-blur-3xl rounded-[3rem] p-6 md:p-12 min-h-[650px] flex flex-col items-center justify-center relative overflow-hidden shadow-2xl border border-amber-500/20">
              {selectedPrize && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 w-full px-4 animate-fade-in">
                  <div className={`backdrop-blur-md px-10 py-3 rounded-full border-2 border-amber-400/50 shadow-2xl flex items-center gap-3 ${currentState === AppState.WINNER_REVEALED ? 'bg-amber-600/90' : 'bg-red-800/90'} transition-colors duration-500`}>
                    {currentState === AppState.WINNER_REVEALED ? <span className="text-2xl">🎉</span> : <Sparkles className="w-6 h-6 text-amber-300 shrink-0" />}
                    <span className="text-amber-100 text-xl md:text-3xl font-black tracking-widest italic truncate whitespace-nowrap">
                      {currentState === AppState.WINNER_REVEALED ? `恭喜得獎 : ${selectedPrize.name}` : `正在抽取：${selectedPrize.name}`}
                    </span>
                    {currentState === AppState.WINNER_REVEALED ? <span className="text-2xl">🎉</span> : <Sparkles className="w-6 h-6 text-amber-300 shrink-0" />}
                  </div>
                </div>
              )}

              {currentState === AppState.IDLE && (
                <div className="text-center animate-fade-in pt-12 flex flex-col items-center">
                  <div className="w-48 h-48 bg-red-600/5 rounded-full flex items-center justify-center mb-10 border-[6px] border-amber-500/10 relative">
                    <div className="absolute inset-0 bg-amber-500/5 rounded-full blur-3xl animate-pulse"></div>
                    <Trophy className="w-24 h-24 text-amber-500/40 relative z-10" />
                  </div>
                  <div className="flex flex-col items-center gap-8">
                    <div className="flex items-center gap-4 bg-black/40 p-6 rounded-[2.5rem] border border-amber-500/20 shadow-xl">
                      <span className="text-amber-500 font-black text-2xl ml-4">抽出</span>
                      <input 
                        type="number" 
                        value={customDrawCount} 
                        onChange={e => setCustomDrawCount(Math.max(1, parseInt(e.target.value) || 1))} 
                        className="w-32 bg-red-950/40 border-2 border-amber-500/30 rounded-2xl px-2 py-3 text-4xl font-black text-center text-amber-100 outline-none focus:border-amber-500 shadow-inner" 
                      />
                      <span className="text-amber-500 font-black text-2xl mr-4">位幸運星</span>
                    </div>
                    <button onClick={() => startDraw(customDrawCount)} className="group relative px-24 py-10 rounded-[3rem] bg-gradient-to-br from-amber-300 via-amber-600 to-amber-700 text-red-950 font-black text-4xl shadow-[0_20px_60px_rgba(217,119,6,0.4)] hover:scale-105 active:scale-95 transition-all border-t-2 border-amber-200/50 flex items-center gap-6">
                      幸運開獎 <Play className="w-10 h-10 fill-current" />
                    </button>
                    <div className="text-amber-500/40 font-bold text-sm bg-black/20 px-4 py-2 rounded-full">
                       參加者總數: {participants.length} 人
                    </div>
                  </div>
                </div>
              )}

              {currentState === AppState.DRAWING && (
                <div className="text-center w-full px-4 flex flex-col items-center justify-center overflow-hidden h-full">
                  <div className="flex flex-col items-center justify-center w-full mb-8">
                      <div ref={rollingNameRef} className="text-5xl md:text-7xl font-black text-amber-100 italic drop-shadow-[0_0_30px_rgba(251,191,36,0.5)] leading-tight px-4 break-words text-center w-full max-w-4xl mx-auto">
                        ...
                      </div>
                  </div>
                  <div className="flex items-center justify-center gap-4 bg-red-950/40 border-2 border-amber-500/30 px-12 py-5 rounded-full shadow-2xl mx-auto">
                     <Armchair className="w-10 h-10 text-amber-400" />
                     <span ref={rollingTableRef} className="font-black text-amber-50 text-5xl tracking-widest whitespace-nowrap">
                       ??
                     </span>
                  </div>
                </div>
              )}

              {currentState === AppState.WINNER_REVEALED && (currentWinner || batchWinners.length > 0) && (
                <div className="text-center w-full h-full flex flex-col">
                  {currentWinner && (
                    <div className="flex flex-col items-center justify-center flex-1 py-8 w-full">
                      <div className="flex flex-col items-center w-full px-4 mb-10">
                          <div className="bg-gradient-to-r from-red-600 to-red-800 text-amber-50 px-12 py-8 rounded-[3rem] font-black shadow-2xl border-4 border-amber-400/60 text-5xl md:text-8xl italic tracking-widest inline-block text-center max-w-full break-words leading-tight">
                            {currentWinner.name}
                          </div>
                      </div>
                      <div className="max-w-4xl mx-auto space-y-8 w-full flex flex-col items-center">
                        <div className="flex flex-wrap items-center justify-center gap-6 w-full">
                            <div className="font-black text-amber-200 bg-red-950/60 py-4 px-12 rounded-full border border-amber-500/20 flex items-center gap-4 justify-center shadow-lg text-3xl md:text-4xl whitespace-nowrap">
                               <Armchair className="w-8 h-8 md:w-10 md:h-10" /> 桌次：{currentWinner.tableNumber || '貴賓'}
                            </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {batchWinners.length > 0 && (
                    <div className="flex flex-col items-center flex-1 overflow-hidden">
                      <h2 className="text-amber-100 text-3xl md:text-5xl font-black italic tracking-widest mb-8 flex items-center gap-4 drop-shadow-lg whitespace-nowrap shrink-0 mt-8">
                        <Gift className="w-10 h-10 text-red-500" /> 馬年行大運 <Gift className="w-10 h-10 text-red-500" />
                      </h2>
                      <div className="flex-1 w-full overflow-y-auto custom-scrollbar px-4 pb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full justify-items-center">
                            {batchWinners.map((w, idx) => (
                            <div key={idx} className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-red-900/90 to-black border border-amber-500/30 p-8 shadow-2xl transform hover:scale-[1.02] transition-all flex flex-col items-center justify-center min-h-[300px] w-full text-center group">
                                <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="text-5xl font-black text-amber-50 mb-4 drop-shadow-md w-full break-words leading-tight relative z-10">{w.name}</div>
                                <div className="text-4xl font-bold text-amber-400 tracking-widest uppercase mt-2 flex items-center justify-center gap-2 border-t border-amber-500/20 pt-4 w-full relative z-10">
                                   <span className="text-amber-500/50 text-xl">桌</span> {w.tableNumber || '貴賓'}
                                </div>
                                <div className="text-sm text-amber-500/60 font-bold mt-4 relative z-10">
                                    {w.prizeName}
                                </div>
                            </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 mb-8 flex flex-wrap gap-6 justify-center shrink-0">
                    <button onClick={() => setCurrentState(AppState.IDLE)} className="px-12 py-5 rounded-2xl bg-amber-500 text-red-950 font-black text-xl md:text-2xl hover:scale-105 transition-all shadow-xl border-t-2 border-amber-200">再抽一輪</button>
                    <button onClick={() => setCurrentState(AppState.IDLE)} className="px-12 py-5 rounded-2xl bg-white/5 text-amber-200/60 font-black text-xl md:text-2xl hover:bg-white/10 transition-all border border-amber-500/20">回主戰場</button>
                  </div>
                </div>
              )}
            </div>

            {/* Winners List (Mobile Optimized) */}
            <div className="bg-black/50 backdrop-blur-xl rounded-[3rem] p-4 md:p-8 border border-amber-500/10 shadow-2xl relative">
              <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-amber-500/10 pb-6">
                <div>
                    <h2 className="text-2xl md:text-4xl font-black flex items-center gap-4 text-amber-500 italic"><ListOrdered className="w-8 h-8 md:w-10 md:h-10" /> 得獎名單</h2>
                    <p className="text-amber-700/60 text-xs md:text-sm font-bold tracking-[0.5em] mt-1 pl-14">馬年行大運</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={exportWinners} className="flex items-center gap-2 px-6 py-3 bg-green-800/40 hover:bg-green-700/60 border border-green-500/30 rounded-2xl text-green-200 font-black transition-all shadow-lg"><Download className="w-5 h-5" /> <span className="hidden md:inline">匯出</span></button>
                  <button data-action="reset-winners" className="p-3 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 rounded-2xl text-red-400 transition-all shadow-lg"><Eraser className="w-5 h-5" /></button>
                </div>
              </div>

              {/* Tab Navigation (Newest Left) */}
              {groupedWinners.length > 0 && (
                <nav className="flex overflow-x-auto gap-3 mb-6 custom-scrollbar pb-2 snap-x">
                    {groupedWinners.map((group, idx) => {
                        const isActive = (activeTabTimestamp === group.timestamp) || (activeTabTimestamp === 0 && idx === 0);
                        const label = batchLabels.get(group.timestamp) || '紀錄';
                        
                        return (
                            <button 
                                key={group.timestamp}
                                onClick={() => setActiveTabTimestamp(group.timestamp)}
                                className={`whitespace-nowrap px-6 py-2 rounded-full font-bold transition-all text-sm snap-start shrink-0 border ${isActive ? 'bg-amber-500 text-red-950 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-transparent text-amber-500/70 border-amber-500/30 hover:border-amber-500 hover:text-amber-400'}`}
                            >
                                {label}
                            </button>
                        )
                    })}
                </nav>
              )}
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px]">
                {winners.length === 0 && <div className="text-center py-24 text-amber-950 font-black italic text-3xl">虛位以待，開獎即見</div>}
                
                {activeGroup && (
                    <div className="animate-fade-in space-y-3">
                        {activeGroup.items.map((w) => (
                            <div key={w.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${w.verified ? 'bg-green-900/10 border-green-500/30 opacity-70' : 'bg-white/5 border-white/10'}`}>
                                {/* Name and Prize (Minimal) */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl md:text-2xl font-black text-amber-50 truncate leading-none">{w.name}</span>
                                        <span className="text-xs text-amber-500/50 hidden md:inline">({w.prizeName})</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1 md:hidden truncate">{w.prizeName}</div>
                                </div>
                                
                                {/* Table Number (Highlighted) */}
                                <div className="shrink-0 text-right px-2 border-r border-white/10">
                                    <div className="text-[9px] text-amber-500/50 uppercase font-bold tracking-wider leading-none mb-0.5">Table</div>
                                    <div className="text-2xl md:text-3xl font-black text-amber-400 leading-none">
                                        {w.tableNumber || '-'}
                                    </div>
                                </div>

                                {/* Checkbox Sync */}
                                <div className="shrink-0 pl-1">
                                    <button 
                                        onClick={() => toggleVerification(w.id)}
                                        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${w.verified ? 'text-green-400' : 'text-gray-600 hover:text-amber-500'}`}
                                    >
                                        {w.verified ? <CheckSquare className="w-8 h-8" /> : <Square className="w-8 h-8" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>

      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowInfo(false)}></div>
          <div className="relative bg-gradient-to-b from-red-900 to-black w-full max-w-2xl rounded-[3rem] p-8 md:p-12 border-2 border-amber-500/30 shadow-2xl animate-fade-in overflow-y-auto max-h-[90vh]">
            <h3 className="text-3xl md:text-5xl font-black mb-10 text-amber-400 italic border-b border-amber-500/10 pb-6 text-center">抽獎秘籍</h3>
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-center">
                <div className="p-8 bg-black/40 rounded-[2.5rem] border border-amber-500/20 shadow-xl">
                  <div className="flex justify-center mb-4"><Users className="text-amber-500 w-8 h-8" /></div>
                  <div className="text-amber-100 font-black text-xl mb-2">名單匯入 (2欄)</div>
                  <p className="text-sm text-amber-500/80">A:姓名 | B:桌次</p>
                </div>
                <div className="p-8 bg-black/40 rounded-[2.5rem] border border-red-500/20 shadow-xl">
                  <div className="flex justify-center mb-4"><Gift className="text-red-500 w-8 h-8" /></div>
                  <div className="text-amber-100 font-black text-xl mb-2">獎項匯入 (2欄)</div>
                  <p className="text-sm text-red-400/80">A:獎名 | B:數量</p>
                </div>
              </div>
              <button onClick={() => setShowInfo(false)} className="w-full bg-gradient-to-r from-amber-500 to-amber-700 text-red-950 font-black py-6 rounded-3xl hover:scale-105 transition-all text-2xl shadow-2xl">領旨開始</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(245,158,11,0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(245,158,11,0.5); }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default App;