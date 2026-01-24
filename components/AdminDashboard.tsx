import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  getCandidates, 
  getAllVoters, 
  getAllVotes,
  addCandidate, 
  deleteCandidate, 
  addVoter, 
  deleteVoter, 
  bulkImportVoters,
  uploadCandidatePhoto,
  getElectionStatus,
  setElectionStatus,
  getSchoolYear,
  setSchoolYear
} from '../lib/supabase';
import { Candidate, Voter, POSITIONS_ORDER, SCHOOL_LOGO_URL, SSLG_LOGO_URL } from '../types';
import { LogOut, RefreshCw, Users, BarChart3, Plus, Trash2, Upload, Image as ImageIcon, FileSpreadsheet, UserPlus, CheckCircle2, XCircle, Download, Printer, Lock, Unlock, Database, Copy, Save } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdminDashboardProps {
  onLogout: () => void;
}

type Tab = 'canvassing' | 'candidates' | 'voters';

interface ChartDataPoint {
  name: string;
  shortName: string;
  votes: number;
  partylist?: string;
  image?: string;
  id: string;
  // Breakdown by grade level
  grades: Record<string, number>;
}

const DEFAULT_PLACEHOLDER = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png";

// Moved outside to ensure constant type
const GRADE_LEVELS: string[] = ['7', '8', '9', '10', '11', '12'];

const SETUP_SQL_SCRIPT = `-- Run this in Supabase SQL Editor to fix the error

-- 1. Create Storage Bucket for photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies
DROP POLICY IF EXISTS "Public View Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;

CREATE POLICY "Public View Access" ON storage.objects FOR SELECT USING ( bucket_id = 'candidate-photos' );
CREATE POLICY "Allow public uploads" ON storage.objects FOR INSERT TO public WITH CHECK ( bucket_id = 'candidate-photos' );
CREATE POLICY "Public Delete Access" ON storage.objects FOR DELETE TO public USING ( bucket_id = 'candidate-photos' );

-- 3. Create Config Table for Election Status
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 4. Seed Default Values
INSERT INTO config (key, value) VALUES ('election_status', 'OPEN') ON CONFLICT DO NOTHING;
INSERT INTO config (key, value) VALUES ('school_year', '2024-2025') ON CONFLICT DO NOTHING;

-- 5. Enable RLS and Grant Permissions
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Grant access to anon (public) and authenticated users
GRANT ALL ON TABLE config TO anon, authenticated, service_role;

-- 6. Config Policies
DROP POLICY IF EXISTS "Public read config" ON config;
DROP POLICY IF EXISTS "Public update config" ON config;
DROP POLICY IF EXISTS "Public insert config" ON config;

CREATE POLICY "Public read config" ON config FOR SELECT USING (true);
CREATE POLICY "Public update config" ON config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public insert config" ON config FOR INSERT WITH CHECK (true);`;

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('canvassing');
  const [data, setData] = useState<Record<string, ChartDataPoint[]>>({});
  const [turnout, setTurnout] = useState({ voted: 0, total: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Election Status & Config
  const [isElectionOpen, setIsElectionOpen] = useState(true);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [showSqlHelp, setShowSqlHelp] = useState(false);
  const [schoolYear, setSchoolYearState] = useState('2024-2025');
  const [isSavingYear, setIsSavingYear] = useState(false);

  // Candidates State
  const [candidateList, setCandidateList] = useState<Candidate[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  // Voters State
  const [voterList, setVoterList] = useState<Voter[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Candidate>>({
    full_name: '',
    position: POSITIONS_ORDER[0],
    partylist: '',
    grade_level: undefined,
  });
  
  const [voterForm, setVoterForm] = useState({
    lrn: '',
    first_name: '',
    last_name: '',
    grade_level: 7
  });
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // --- DATA FETCHING ---

  // Separate function for School Year to avoid overwriting user input during polling
  const fetchSchoolYearData = async () => {
    try {
      const year = await getSchoolYear();
      setSchoolYearState(year);
    } catch (e) {
      console.error("Error fetching school year:", e);
    }
  };

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      // 0. Fetch Configs (Status only, exclude School Year to avoid input conflict)
      const status = await getElectionStatus();
      
      setIsElectionOpen(status);
      
      // 1. Fetch Lists
      const cList: Candidate[] = await getCandidates();
      const vList: Voter[] = await getAllVoters();
      
      setCandidateList(cList);
      setVoterList(vList);

      // 2. Fetch All Votes for detailed analytics
      const allVotes = await getAllVotes();

      // 3. Process Data locally
      // Create a map of candidateID -> { total: number, grades: { '7': 0, '8': 0... } }
      const voteMap: Record<string, { total: number, grades: Record<string, number> }> = {};
      
      allVotes.forEach(vote => {
        if (!vote.candidate_id) return;
        
        if (!voteMap[vote.candidate_id]) {
          voteMap[vote.candidate_id] = { total: 0, grades: {} };
        }
        
        voteMap[vote.candidate_id].total += 1;
        
        const gradeKey = vote.grade_level ? vote.grade_level.toString() : 'Unknown';
        voteMap[vote.candidate_id].grades[gradeKey] = (voteMap[vote.candidate_id].grades[gradeKey] || 0) + 1;
      });

      // 4. Organize into Chart Data
      const newData: Record<string, ChartDataPoint[]> = {};

      POSITIONS_ORDER.forEach(pos => {
         if (pos === 'Grade Level Rep') {
            const reps: Candidate[] = cList.filter((c: Candidate) => c.position === 'Grade Level Rep');
            const grades = Array.from(new Set(reps.map(r => r.grade_level))).sort((a,b) => (a || 0) - (b || 0));
            
            grades.forEach(g => {
               if (!g) return;
               const relevantCandidates: Candidate[] = reps.filter((c: Candidate) => c.grade_level === g);
               if (relevantCandidates.length > 0) {
                 const chartData = relevantCandidates.map((c: Candidate) => ({
                    id: c.id,
                    name: c.full_name,
                    shortName: c.full_name.split(' ')[0], 
                    votes: voteMap[c.id]?.total || 0,
                    partylist: c.partylist,
                    image: c.image_url,
                    grades: voteMap[c.id]?.grades || {}
                 })).sort((a, b) => b.votes - a.votes);
                 newData[`Grade ${g} Representative`] = chartData;
               }
            });

         } else {
             const relevantCandidates: Candidate[] = cList.filter((c: Candidate) => c.position === pos);
             if (relevantCandidates.length > 0) {
               const chartData = relevantCandidates.map((c: Candidate) => ({
                 id: c.id,
                 name: c.full_name,
                 shortName: c.full_name.split(' ')[0], 
                 votes: voteMap[c.id]?.total || 0,
                 partylist: c.partylist,
                 image: c.image_url,
                 grades: voteMap[c.id]?.grades || {}
               })).sort((a, b) => b.votes - a.votes);
               newData[pos] = chartData;
             }
         }
      });

      setData(newData);

      // 5. Calculate Turnout
      const votedCount = vList.filter(v => v.has_voted).length;
      setTurnout({
        voted: votedCount,
        total: vList.length
      });
      
      setLastUpdated(new Date());

    } catch (e) {
      console.error("Failed to load admin data", e);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSchoolYearData(); // Fetch once on mount
    fetchData(); // Fetch other data immediately
    const interval = setInterval(fetchData, 5000); // Poll other data every 5s
    return () => clearInterval(interval);
  }, []);

  // --- WINNERS LOGIC ---
  const winners = useMemo(() => {
    const wins: { position: string, candidate: ChartDataPoint | null }[] = [];
    Object.entries(data).forEach(([pos, candidates]: [string, ChartDataPoint[]]) => {
       if (candidates.length > 0) {
         // Candidates are already sorted by votes in fetchData
         wins.push({ position: pos, candidate: candidates[0] });
       }
    });
    return wins;
  }, [data]);

  // --- HANDLERS ---
  const handlePrint = () => {
    window.print();
  };
  
  const handleToggleElection = async () => {
     const action = isElectionOpen ? 'CLOSE' : 'OPEN';
     if (!window.confirm(`Are you sure you want to ${action} the election?\n${isElectionOpen ? 'Voters will no longer be able to log in or cast votes.' : 'Voters will be allowed to cast votes.'}`)) {
       return;
     }
     
     setIsTogglingStatus(true);
     try {
       await setElectionStatus(!isElectionOpen);
       setIsElectionOpen(!isElectionOpen);
       fetchData();
     } catch (e: any) {
       console.error(e);
       const msg = e.message || "";
       if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("config")) {
          setShowSqlHelp(true);
       } else {
          alert(`Failed to update election status. \n\nError: ${msg}`);
       }
     } finally {
       setIsTogglingStatus(false);
     }
  };

  const handleSaveSchoolYear = async () => {
    setIsSavingYear(true);
    try {
      await setSchoolYear(schoolYear);
      // Optional: Re-fetch to confirm save, but local state is already accurate to user intent
    } catch (e: any) {
      console.error("Failed to save school year", e);
      // Revert if failed? Or just let user know
      alert("Failed to save School Year. Check internet or permissions.");
    } finally {
      setIsSavingYear(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SETUP_SQL_SCRIPT);
    alert("SQL Code copied to clipboard! Now paste it in Supabase SQL Editor.");
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      if (!formData.full_name || !formData.position) return;
      let imageUrl = DEFAULT_PLACEHOLDER;
      if (imageFile) {
        imageUrl = await uploadCandidatePhoto(imageFile);
      }
      await addCandidate({
        full_name: formData.full_name,
        position: formData.position,
        partylist: formData.partylist || 'Independent',
        grade_level: formData.position === 'Grade Level Rep' ? formData.grade_level : undefined,
        image_url: imageUrl
      });
      setFormData({ full_name: '', position: POSITIONS_ORDER[0], partylist: '', grade_level: undefined });
      setImageFile(null);
      setImagePreview(null);
      fetchData();
      alert("Candidate added successfully!");
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      await addVoter(voterForm);
      setVoterForm({ lrn: '', first_name: '', last_name: '', grade_level: 7 });
      fetchData();
      alert("Voter registered successfully.");
    } catch (error) {
      alert("Error adding voter. LRN might be duplicate.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;
      setIsImporting(true);
      try {
        const rows = text.split('\n');
        const votersToImport = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i].trim();
          if (!row) continue;
          const cols = row.split(',');
          if (cols.length >= 4) {
            votersToImport.push({
              lrn: cols[0].trim(),
              first_name: cols[1].trim(),
              last_name: cols[2].trim(),
              grade_level: cols[3].trim()
            });
          }
        }
        if (votersToImport.length > 0) {
          await bulkImportVoters(votersToImport);
          alert(`Successfully imported ${votersToImport.length} voters.`);
          fetchData();
        } else {
          alert("No valid data found in CSV.");
        }
      } catch (err) {
        alert("Error processing CSV file.");
      } finally {
        setIsImporting(false);
        e.target.value = ''; 
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csvContent = "lrn,first_name,last_name,grade_level\n123456789012,Juan,Dela Cruz,10\n109876543210,Maria,Clara,9";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "voter_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string, type: 'candidate' | 'voter') => {
    if(window.confirm(`Are you sure you want to delete this ${type}?`)) {
      try {
        if (type === 'candidate') await deleteCandidate(id);
        else await deleteVoter(id);
        fetchData();
      } catch (e) {
        alert("Failed to delete. It might be linked to existing votes.");
      }
    }
  };

  const percentage = turnout.total > 0 ? Math.round((turnout.voted / turnout.total) * 100) : 0;
  
  return (
    <>
      <div className="min-h-screen bg-slate-900 text-white font-sans print:hidden">
        {/* Top Navigation Bar */}
        <div className="bg-slate-800 border-b border-slate-700 sticky top-0 z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between py-3 sm:py-0 sm:h-16 gap-3">
              
              <div className="w-full sm:w-auto flex items-center justify-between">
                <div>
                   <h1 className="text-lg sm:text-xl font-bold tracking-tight">Admin Portal</h1>
                   <p className="text-[10px] sm:text-xs text-slate-400">RMCHS SSLG Election</p>
                </div>
                <button 
                  onClick={onLogout} 
                  className="sm:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                >
                  <LogOut size={20} />
                </button>
              </div>
              
              <nav className="w-full sm:w-auto flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => setActiveTab('canvassing')}
                  className={cn(
                    "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap",
                    activeTab === 'canvassing' ? "bg-green-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                >
                  <BarChart3 size={16} /> <span className="inline">Canvassing</span>
                </button>
                <button 
                  onClick={() => setActiveTab('candidates')}
                  className={cn(
                    "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap",
                    activeTab === 'candidates' ? "bg-green-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                >
                  <Users size={16} /> Candidates
                </button>
                <button 
                  onClick={() => setActiveTab('voters')}
                  className={cn(
                    "flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap",
                    activeTab === 'voters' ? "bg-green-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                >
                  <UserPlus size={16} /> Voters
                </button>
              </nav>

              <div className="hidden sm:flex items-center gap-3">
                 <button
                   onClick={handleToggleElection}
                   disabled={isTogglingStatus}
                   className={cn(
                     "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                     isElectionOpen 
                       ? "bg-green-500/10 text-green-400 border-green-500/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500" 
                       : "bg-red-500/10 text-red-400 border-red-500/50 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500"
                   )}
                 >
                   {isTogglingStatus ? <RefreshCw size={14} className="animate-spin" /> : (isElectionOpen ? <Unlock size={14} /> : <Lock size={14} />)}
                   {isElectionOpen ? "Election Open" : "Election Closed"}
                 </button>
                 <button onClick={onLogout} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition">
                   <LogOut size={16} /> Logout
                 </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          
          {/* Mobile Election Status Toggle */}
          <div className="sm:hidden mb-4 flex justify-center">
             <button
                onClick={handleToggleElection}
                disabled={isTogglingStatus}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border",
                  isElectionOpen 
                    ? "bg-green-900/30 text-green-400 border-green-700" 
                    : "bg-red-900/30 text-red-400 border-red-700"
                )}
              >
                {isTogglingStatus ? <RefreshCw size={16} className="animate-spin" /> : (isElectionOpen ? <Unlock size={16} /> : <Lock size={16} />)}
                {isElectionOpen ? "Election is OPEN (Tap to Close)" : "Election is CLOSED (Tap to Open)"}
              </button>
          </div>

          {/* === TAB: CANVASSING === */}
          {activeTab === 'canvassing' && (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 border-b border-slate-700 pb-6">
                
                {/* School Year Configuration */}
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                     <Database size={10} /> School Year
                   </label>
                   <div className="flex items-center gap-2">
                     <input 
                       type="text" 
                       value={schoolYear} 
                       onChange={(e) => setSchoolYearState(e.target.value)}
                       onBlur={handleSaveSchoolYear}
                       className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 w-full sm:w-48 focus:ring-2 focus:ring-green-500 outline-none font-bold text-sm"
                       placeholder="e.g. 2024-2025"
                     />
                     {isSavingYear && <RefreshCw size={14} className="text-green-500 animate-spin" />}
                   </div>
                </div>

                <button 
                  onClick={handlePrint}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg transition"
                >
                  <Printer size={18} /> Print Official Report
                </button>
              </div>

              {/* Turnout Widget */}
              <div className="bg-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-700">
                <div className="flex justify-between items-end mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Voter Turnout</h2>
                  <div className="text-right">
                    <span className="text-3xl sm:text-4xl font-bold text-green-400">{percentage}%</span>
                    <p className="text-xs sm:text-sm text-slate-400">{turnout.voted} / {turnout.total} Registered</p>
                  </div>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3 sm:h-4 overflow-hidden">
                  <div 
                    className="bg-green-500 h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {Object.keys(data).length === 0 && (
                  <div className="col-span-1 md:col-span-2 text-center py-20 text-slate-500 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                    {isLoadingData ? "Loading results..." : "No candidates or votes yet."}
                  </div>
                )}
                {Object.entries(data).map(([pos, chartData]: [string, ChartDataPoint[]]) => (
                  <div key={pos} className="bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-700 shadow-xl">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h3 className="text-base sm:text-lg font-bold text-slate-200">{pos}</h3>
                      <RefreshCw size={14} className={cn("text-slate-500", isLoadingData && "animate-spin")} />
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="shortName" type="category" stroke="#94a3b8" width={80} tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                            cursor={{ fill: '#334155', opacity: 0.4 }}
                          />
                          <Bar dataKey="votes" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ... (Other tabs remain the same) ... */}
          {/* === TAB: CANDIDATES === */}
          {activeTab === 'candidates' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Add Candidate Form */}
              <div className="lg:col-span-1">
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 sm:p-6 sticky top-24">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Plus size={20} className="text-green-500" /> Encode Candidate
                  </h2>
                  <form onSubmit={handleAddCandidate} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-400">Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={formData.full_name}
                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        placeholder="e.g. Juan Dela Cruz"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-400">Position</label>
                      <select 
                        value={formData.position}
                        onChange={e => setFormData({...formData, position: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      >
                        {POSITIONS_ORDER.map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </div>
                    {formData.position === 'Grade Level Rep' && (
                      <div className="space-y-1 animate-in fade-in">
                        <label className="text-xs font-medium text-slate-400">Grade Level</label>
                        <select 
                          required
                          value={formData.grade_level || ''}
                          onChange={e => setFormData({...formData, grade_level: Number(e.target.value)})}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        >
                           <option value="" disabled>Select Grade</option>
                           {Array.from({length: 12}, (_, i) => i + 1).map(g => (
                             <option key={g} value={g}>Grade {g}</option>
                           ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-400">Partylist (Optional)</label>
                      <input 
                        type="text" 
                        value={formData.partylist}
                        onChange={e => setFormData({...formData, partylist: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        placeholder="e.g. Maka-Tao Party"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-400">Candidate Photo</label>
                      <div className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center hover:border-green-500 transition-colors cursor-pointer relative">
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={handleImageChange}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        {imagePreview ? (
                          <div className="relative w-24 h-24 mx-auto">
                             <img src={imagePreview} className="w-full h-full object-cover rounded-full border-2 border-slate-500" />
                             <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 hover:opacity-100 transition">
                               <Upload size={16} />
                             </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-slate-500">
                             <ImageIcon size={24} />
                             <span className="text-xs">Click to upload photo</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      type="submit" 
                      disabled={isAdding}
                      className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-lg transition shadow-lg shadow-green-600/20 disabled:opacity-50"
                    >
                      {isAdding ? 'Saving...' : 'Enroll Candidate'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Candidate List */}
              <div className="lg:col-span-2 space-y-4">
                 <h2 className="text-lg font-bold">Enrolled Candidates</h2>
                 <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                   <div className="overflow-x-auto">
                     <table className="w-full text-left text-sm text-slate-400 whitespace-nowrap">
                       <thead className="bg-slate-900/50 text-slate-200 uppercase text-xs font-semibold">
                         <tr>
                           <th className="px-4 py-3 sm:px-6 sm:py-4">Candidate</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4">Position</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4">Partylist</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-700">
                         {candidateList.map((candidate) => (
                           <tr key={candidate.id} className="hover:bg-slate-700/30 transition">
                             <td className="px-4 py-3 sm:px-6 sm:py-4 flex items-center gap-3">
                               <img 
                                 src={candidate.image_url || DEFAULT_PLACEHOLDER} 
                                 alt={candidate.full_name} 
                                 className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover bg-slate-700"
                               />
                               <span className="font-medium text-white">{candidate.full_name}</span>
                             </td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4">
                               {candidate.position}
                               {candidate.grade_level && <span className="ml-2 text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">Gr. {candidate.grade_level}</span>}
                             </td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4">{candidate.partylist}</td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                               <button 
                                 onClick={() => handleDelete(candidate.id, 'candidate')}
                                 className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-lg transition"
                                 title="Delete Candidate"
                               >
                                 <Trash2 size={16} />
                               </button>
                             </td>
                           </tr>
                         ))}
                         {candidateList.length === 0 && (
                           <tr>
                             <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                               No candidates enrolled yet.
                             </td>
                           </tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                 </div>
              </div>
            </div>
          )}

          {/* === TAB: VOTERS === */}
          {activeTab === 'voters' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* Add Voter Form */}
               <div className="lg:col-span-1 space-y-6">
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 sm:p-6 sticky top-24">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <UserPlus size={20} className="text-green-500" /> Register Voter
                    </h2>
                    <form onSubmit={handleAddVoter} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-400">LRN (12 Digits)</label>
                        <input 
                          type="text" 
                          required
                          maxLength={12}
                          value={voterForm.lrn}
                          onChange={e => setVoterForm({...voterForm, lrn: e.target.value.replace(/\D/g, '')})}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none font-mono"
                          placeholder="000000000000"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-400">First Name</label>
                          <input 
                            type="text" 
                            required
                            value={voterForm.first_name}
                            onChange={e => setVoterForm({...voterForm, first_name: e.target.value})}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-400">Last Name</label>
                          <input 
                            type="text" 
                            required
                            value={voterForm.last_name}
                            onChange={e => setVoterForm({...voterForm, last_name: e.target.value})}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-400">Grade Level</label>
                        <select 
                          required
                          value={voterForm.grade_level}
                          onChange={e => setVoterForm({...voterForm, grade_level: Number(e.target.value)})}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        >
                           {Array.from({length: 6}, (_, i) => i + 7).map(g => (
                             <option key={g} value={g}>Grade {g}</option>
                           ))}
                        </select>
                      </div>
                      <button 
                        type="submit" 
                        disabled={isAdding}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-lg transition shadow-lg shadow-green-600/20 disabled:opacity-50"
                      >
                        {isAdding ? 'Saving...' : 'Register Student'}
                      </button>
                    </form>
                    <div className="mt-6 pt-6 border-t border-slate-700 space-y-3">
                      <div className="relative">
                        <button 
                          disabled={isImporting}
                          className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 border border-slate-600 cursor-pointer"
                        >
                          {isImporting ? <span className="animate-spin">⏳</span> : <FileSpreadsheet size={18} />}
                          Import CSV / Excel
                        </button>
                        <input 
                          type="file" 
                          accept=".csv"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={handleFileImport}
                          disabled={isImporting}
                        />
                      </div>
                      <button 
                        onClick={handleDownloadTemplate}
                        className="w-full bg-transparent border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 font-medium py-2 rounded-lg transition flex items-center justify-center gap-2 text-xs"
                      >
                        <Download size={14} /> Download CSV Template
                      </button>
                      <p className="text-[10px] text-slate-500 text-center">
                        Upload .csv file with headers: lrn, first_name, last_name, grade_level
                      </p>
                    </div>
                  </div>
               </div>
               {/* Voter List */}
               <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Registered Voters</h2>
                    <span className="text-xs sm:text-sm bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700">
                      Total: {voterList.length}
                    </span>
                  </div>
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden max-h-[600px] overflow-y-auto">
                     <table className="w-full text-left text-sm text-slate-400 whitespace-nowrap">
                       <thead className="bg-slate-900/50 text-slate-200 uppercase text-xs font-semibold sticky top-0 z-10">
                         <tr>
                           <th className="px-4 py-3 sm:px-6 sm:py-4">LRN</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4">Name</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4">Grade</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4 text-center">Passcode</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4 text-center">Status</th>
                           <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-700">
                         {voterList.map((voter) => (
                           <tr key={voter.id} className="hover:bg-slate-700/30 transition">
                             <td className="px-4 py-3 sm:px-6 sm:py-4 font-mono text-slate-300">{voter.lrn}</td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-white">
                               {voter.last_name}, {voter.first_name}
                             </td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4">Gr. {voter.grade_level}</td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4 text-center font-mono text-xs bg-slate-900/30 rounded py-1 select-all">
                               {voter.passcode}
                             </td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                               {voter.has_voted ? (
                                 <span className="inline-flex items-center gap-1 text-green-400 text-xs font-bold uppercase">
                                   <CheckCircle2 size={14} /> Voted
                                 </span>
                               ) : (
                                 <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-bold uppercase">
                                   <XCircle size={14} /> Pending
                                 </span>
                               )}
                             </td>
                             <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                               <button 
                                 onClick={() => handleDelete(voter.id, 'voter')}
                                 className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-lg transition"
                                 title="Remove Voter"
                               >
                                 <Trash2 size={16} />
                               </button>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* --- PRINT VIEW --- */}
      <div className="hidden print:block bg-white text-black p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-green-800">
          <img src={SCHOOL_LOGO_URL} className="w-20 h-20 object-contain rounded-full" alt="School Logo" />
          <div className="text-center">
             <h1 className="text-2xl font-bold uppercase text-green-900">Official Election Returns</h1>
             <p className="font-semibold text-gray-700">SSLG Elections {schoolYear}</p>
             <p className="text-sm text-gray-500">Ramon Magsaysay (Cubao) High School</p>
             <p className="text-xs text-gray-400 mt-1">Generated: {lastUpdated.toLocaleString()}</p>
          </div>
          <img src={SSLG_LOGO_URL} className="w-20 h-20 object-contain rounded-full" alt="SSLG Logo" />
        </div>

        {/* 1. WINNERS LIST */}
        <div className="mb-10 break-inside-avoid">
           <h2 className="text-xl font-bold text-white bg-green-800 px-4 py-2 mb-4 rounded-sm print:bg-green-800 print:text-white uppercase tracking-wider">
             Official List of Winners
           </h2>
           <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-12 gap-2 font-bold text-xs uppercase bg-gray-100 p-2 border-b-2 border-gray-300">
                 <div className="col-span-4">Position</div>
                 <div className="col-span-4">Elected Officer</div>
                 <div className="col-span-2">Partylist</div>
                 <div className="col-span-2 text-right">Total Votes</div>
              </div>
              {winners.map((win, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 text-sm p-2 border-b border-gray-200 items-center">
                   <div className="col-span-4 font-bold text-gray-800 uppercase">{win.position}</div>
                   <div className="col-span-4 font-bold text-green-800 flex items-center gap-2">
                      {win.candidate ? (
                         <>
                           <img src={win.candidate.image || DEFAULT_PLACEHOLDER} className="w-8 h-8 rounded-full border border-gray-200 object-cover" />
                           {win.candidate.name}
                         </>
                      ) : (
                         <span className="text-gray-400 italic">No Candidate</span>
                      )}
                   </div>
                   <div className="col-span-2 text-xs text-gray-600">{win.candidate?.partylist || "-"}</div>
                   <div className="col-span-2 text-right font-mono font-bold">{win.candidate?.votes || 0}</div>
                </div>
              ))}
           </div>
        </div>

        {/* 2. DETAILED BREAKDOWN & GRAPHS */}
        <div className="break-inside-avoid">
           <h2 className="text-xl font-bold text-white bg-gray-800 px-4 py-2 mb-6 rounded-sm print:bg-gray-800 print:text-white uppercase tracking-wider">
             Canvassing Report & Demographics
           </h2>

           <div className="space-y-8">
             {Object.entries(data).map(([pos, candidates]: [string, ChartDataPoint[]]) => (
               <div key={pos} className="break-inside-avoid border rounded-lg p-4 border-gray-300">
                 <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4 uppercase">{pos}</h3>
                 
                 {candidates.map((c: ChartDataPoint, i: number) => {
                    const maxVotes = candidates[0]?.votes || 1; // Avoid div by zero
                    const percentage = Math.round((c.votes / (turnout.voted || 1)) * 100);
                    const barWidth = Math.max(0, Math.min(100, (c.votes / maxVotes) * 100));

                    return (
                      <div key={c.id} className="mb-4 last:mb-0">
                         <div className="flex justify-between items-end mb-1">
                            <div className="flex items-center gap-2">
                               <span className="font-bold text-sm w-6 text-gray-400">#{i+1}</span>
                               <span className="font-bold text-sm text-gray-800">{c.name}</span>
                               <span className="text-xs text-gray-500">({c.partylist})</span>
                            </div>
                            <div className="text-sm font-bold">
                               {c.votes} <span className="text-xs font-normal text-gray-500">votes</span>
                            </div>
                         </div>
                         
                         {/* Main Result Bar */}
                         <div className="w-full bg-gray-100 h-4 rounded-sm overflow-hidden mb-2 border border-gray-200">
                            <div 
                              className="h-full bg-green-600 print:bg-green-600 print:print-color-adjust-exact" 
                              style={{ width: `${barWidth}%` }}
                            />
                         </div>

                         {/* Demographic Breakdown (Votes per Grade) */}
                         <div className="flex items-center gap-2 pl-8">
                            <span className="text-[10px] text-gray-400 font-bold uppercase w-16">Grade Breakdown:</span>
                            <div className="flex-1 flex gap-1 h-3">
                              {GRADE_LEVELS.map(grade => {
                                const gVotes = c.grades[grade] || 0;
                                return (
                                  <div key={grade} className="flex items-center bg-gray-50 border border-gray-200 rounded px-1.5 gap-1">
                                     <span className="text-[9px] text-gray-500 font-bold">G{grade}</span>
                                     <span className="text-[10px] font-mono font-bold">{gVotes}</span>
                                  </div>
                                )
                              })}
                            </div>
                         </div>
                      </div>
                    );
                 })}
               </div>
             ))}
           </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-300 text-center text-xs text-gray-500">
          <p>This report is system-generated and serves as the official tally of the RMCHS SSLG Election.</p>
          <p>Certified Correct by the Commission on Elections.</p>
        </div>
      </div>

      {/* SQL HELP MODAL */}
      {showSqlHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
           <div className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-2xl">
                 <div className="flex items-center gap-3">
                   <Database className="text-red-500" size={24} />
                   <div>
                      <h3 className="text-lg font-bold text-white">Missing Database Table</h3>
                      <p className="text-xs text-slate-400">The "config" table was not found.</p>
                   </div>
                 </div>
                 <button onClick={() => setShowSqlHelp(false)} className="text-slate-400 hover:text-white">
                   <XCircle size={24} />
                 </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 bg-slate-950">
                 <p className="text-sm text-slate-300 mb-4">
                    The app cannot save the election status because the database is incomplete. 
                    Please run the following SQL script in your Supabase Dashboard:
                 </p>
                 <div className="relative">
                   <pre className="bg-black border border-slate-800 rounded-lg p-4 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap h-64">
                      {SETUP_SQL_SCRIPT}
                   </pre>
                   <button 
                     onClick={handleCopySql}
                     className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-md transition border border-slate-600"
                     title="Copy Code"
                   >
                     <Copy size={16} />
                   </button>
                 </div>
                 <div className="mt-4 text-xs text-slate-500 space-y-1">
                    <p>1. Go to <a href="https://supabase.com/dashboard" target="_blank" className="text-blue-400 hover:underline">Supabase Dashboard</a></p>
                    <p>2. Open your project &rarr; SQL Editor</p>
                    <p>3. Paste the code above and click RUN</p>
                 </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-900 rounded-b-2xl flex justify-end">
                 <button 
                   onClick={() => setShowSqlHelp(false)}
                   className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition"
                 >
                   Close
                 </button>
              </div>
           </div>
        </div>
      )}
    </>
  );
};

export default AdminDashboard;