import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  getCandidates, 
  getAllVoters, 
  getVoteCounts,
  addCandidate, 
  deleteCandidate, 
  addVoter, 
  deleteVoter, 
  bulkImportVoters,
  uploadCandidatePhoto
} from '../lib/supabase';
import { Candidate, Voter, POSITIONS_ORDER } from '../types';
import { LogOut, RefreshCw, Users, BarChart3, Plus, Trash2, Upload, Image as ImageIcon, FileSpreadsheet, UserPlus, CheckCircle2, XCircle, Download } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdminDashboardProps {
  onLogout: () => void;
}

type Tab = 'canvassing' | 'candidates' | 'voters';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('canvassing');
  const [data, setData] = useState<Record<string, any[]>>({});
  const [turnout, setTurnout] = useState({ voted: 0, total: 0 });
  
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
  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      // 1. Fetch Lists
      const cList = await getCandidates();
      const vList = await getAllVoters();
      
      setCandidateList(cList);
      setVoterList(vList);

      // 2. Fetch Votes
      const voteCounts = await getVoteCounts();

      // 3. Process Chart Data
      const newData: Record<string, any[]> = {};

      POSITIONS_ORDER.forEach(pos => {
         if (pos === 'Grade Level Rep') {
            const reps = cList.filter(c => c.position === 'Grade Level Rep');
            const grades = Array.from(new Set(reps.map(r => r.grade_level))).sort((a,b) => (a || 0) - (b || 0));
            
            grades.forEach(g => {
               if (!g) return;
               const relevantCandidates = reps.filter(c => c.grade_level === g);
               if (relevantCandidates.length > 0) {
                 const chartData = relevantCandidates.map(c => ({
                    name: c.full_name,
                    shortName: c.full_name.split(' ')[0], 
                    votes: voteCounts[c.id] || 0,
                    partylist: c.partylist,
                    image: c.image_url
                 }));
                 newData[`Grade ${g} Representative`] = chartData;
               }
            });

         } else {
             const relevantCandidates = cList.filter(c => c.position === pos);
             if (relevantCandidates.length > 0) {
               const chartData = relevantCandidates.map(c => ({
                 name: c.full_name,
                 shortName: c.full_name.split(' ')[0], 
                 votes: voteCounts[c.id] || 0,
                 partylist: c.partylist,
                 image: c.image_url
               }));
               newData[pos] = chartData;
             }
         }
      });

      setData(newData);

      // 4. Calculate Turnout
      const votedCount = vList.filter(v => v.has_voted).length;
      setTurnout({
        voted: votedCount,
        total: vList.length
      });

    } catch (e) {
      console.error("Failed to load admin data", e);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  // --- HANDLERS ---

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
      
      let imageUrl = "https://picsum.photos/200"; // Fallback
      
      if (imageFile) {
        const uploadedUrl = await uploadCandidatePhoto(imageFile);
        if (uploadedUrl) imageUrl = uploadedUrl;
      }

      await addCandidate({
        full_name: formData.full_name,
        position: formData.position,
        partylist: formData.partylist || 'Independent',
        grade_level: formData.position === 'Grade Level Rep' ? formData.grade_level : undefined,
        image_url: imageUrl
      });

      // Reset
      setFormData({
        full_name: '',
        position: POSITIONS_ORDER[0],
        partylist: '',
        grade_level: undefined,
      });
      setImageFile(null);
      setImagePreview(null);
      fetchData();
      alert("Candidate added successfully!");
    } catch (error) {
      console.error(error);
      alert("Error adding candidate.");
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
      console.error(error);
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

        // Assuming Header row, start at i=1
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
        console.error(err);
        alert("Error processing CSV file.");
      } finally {
        setIsImporting(false);
        // Clear input
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
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Top Navigation Bar */}
      <div className="bg-slate-800 border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
               <h1 className="text-xl font-bold tracking-tight">Admin Portal</h1>
               <p className="text-xs text-slate-400">RMCHS SSLG Election</p>
            </div>
            
            <nav className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg ml-8 overflow-x-auto">
              <button 
                onClick={() => setActiveTab('canvassing')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
                  activeTab === 'canvassing' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <BarChart3 size={16} /> Live Canvassing
              </button>
              <button 
                onClick={() => setActiveTab('candidates')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
                  activeTab === 'candidates' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Users size={16} /> Manage Candidates
              </button>
              <button 
                onClick={() => setActiveTab('voters')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
                  activeTab === 'voters' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <UserPlus size={16} /> Manage Voters
              </button>
            </nav>
          </div>

          <button onClick={onLogout} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        
        {/* === TAB: CANVASSING === */}
        {activeTab === 'canvassing' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Turnout Widget */}
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div className="flex justify-between items-end mb-4">
                <h2 className="text-xl font-semibold">Voter Turnout</h2>
                <div className="text-right">
                  <span className="text-4xl font-bold text-blue-400">{percentage}%</span>
                  <p className="text-sm text-slate-400">{turnout.voted} / {turnout.total} Registered</p>
                </div>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.keys(data).length === 0 && (
                <div className="col-span-2 text-center py-20 text-slate-500 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                  {isLoadingData ? "Loading results..." : "No candidates or votes yet."}
                </div>
              )}
              {Object.entries(data).map(([pos, chartData]) => (
                <div key={pos} className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-200">{pos}</h3>
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
                        <Bar dataKey="votes" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === TAB: CANDIDATES === */}
        {activeTab === 'candidates' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Add Candidate Form */}
            <div className="lg:col-span-1">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 sticky top-24">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus size={20} className="text-blue-500" /> Encode Candidate
                </h2>
                
                <form onSubmit={handleAddCandidate} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={formData.full_name}
                      onChange={e => setFormData({...formData, full_name: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="e.g. Juan Dela Cruz"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400">Position</label>
                    <select 
                      value={formData.position}
                      onChange={e => setFormData({...formData, position: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="e.g. Maka-Tao Party"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400">Candidate Photo</label>
                    <div className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center hover:border-blue-500 transition-colors cursor-pointer relative">
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
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
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
                   <table className="w-full text-left text-sm text-slate-400">
                     <thead className="bg-slate-900/50 text-slate-200 uppercase text-xs font-semibold">
                       <tr>
                         <th className="px-6 py-4">Candidate</th>
                         <th className="px-6 py-4">Position</th>
                         <th className="px-6 py-4">Partylist</th>
                         <th className="px-6 py-4 text-right">Actions</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-700">
                       {candidateList.map((candidate) => (
                         <tr key={candidate.id} className="hover:bg-slate-700/30 transition">
                           <td className="px-6 py-4 flex items-center gap-3">
                             <img 
                               src={candidate.image_url} 
                               alt={candidate.full_name} 
                               className="w-10 h-10 rounded-full object-cover bg-slate-700"
                             />
                             <span className="font-medium text-white">{candidate.full_name}</span>
                           </td>
                           <td className="px-6 py-4">
                             {candidate.position}
                             {candidate.grade_level && <span className="ml-2 text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">Gr. {candidate.grade_level}</span>}
                           </td>
                           <td className="px-6 py-4">{candidate.partylist}</td>
                           <td className="px-6 py-4 text-right">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
             {/* Add Voter Form */}
             <div className="lg:col-span-1 space-y-6">
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 sticky top-24">
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
                        {isImporting ? (
                           <span className="animate-spin">⏳</span>
                        ) : (
                           <FileSpreadsheet size={18} />
                        )}
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
                  <span className="text-sm bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700">
                    Total: {voterList.length}
                  </span>
                </div>
                
                <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden max-h-[600px] overflow-y-auto">
                   <table className="w-full text-left text-sm text-slate-400">
                     <thead className="bg-slate-900/50 text-slate-200 uppercase text-xs font-semibold sticky top-0 z-10">
                       <tr>
                         <th className="px-6 py-4">LRN</th>
                         <th className="px-6 py-4">Name</th>
                         <th className="px-6 py-4">Grade</th>
                         <th className="px-6 py-4 text-center">Passcode</th>
                         <th className="px-6 py-4 text-center">Status</th>
                         <th className="px-6 py-4 text-right">Actions</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-700">
                       {voterList.map((voter) => (
                         <tr key={voter.id} className="hover:bg-slate-700/30 transition">
                           <td className="px-6 py-4 font-mono text-slate-300">{voter.lrn}</td>
                           <td className="px-6 py-4 font-medium text-white">
                             {voter.last_name}, {voter.first_name}
                           </td>
                           <td className="px-6 py-4">Gr. {voter.grade_level}</td>
                           <td className="px-6 py-4 text-center font-mono text-xs bg-slate-900/30 rounded py-1 select-all">
                             {voter.passcode}
                           </td>
                           <td className="px-6 py-4 text-center">
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
                           <td className="px-6 py-4 text-right">
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
                       {voterList.length === 0 && (
                         <tr>
                           <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                             {isLoadingData ? "Loading..." : "No voters registered yet."}
                           </td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminDashboard;
