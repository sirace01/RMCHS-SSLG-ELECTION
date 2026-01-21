import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { mockCandidates, mockVoters, addCandidate, deleteCandidate } from '../lib/supabase';
import { Candidate, POSITIONS_ORDER } from '../types';
import { LogOut, RefreshCw, Users, BarChart3, Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdminDashboardProps {
  onLogout: () => void;
}

type Tab = 'canvassing' | 'candidates';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('canvassing');
  const [data, setData] = useState<Record<string, any[]>>({});
  const [turnout, setTurnout] = useState({ voted: 0, total: 0 });
  
  // Candidates State
  const [candidateList, setCandidateList] = useState<Candidate[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState<Partial<Candidate>>({
    full_name: '',
    position: POSITIONS_ORDER[0],
    partylist: '',
    grade_level: undefined,
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fetchData = () => {
    // MOCK DATA GENERATION - In real app, this is a Supabase subscription or fetch
    const voteCounts: Record<string, number> = {};
    
    // Refresh local candidate list from source
    setCandidateList([...mockCandidates]);

    // Simulate random votes for demo visualization
    mockCandidates.forEach(c => {
      voteCounts[c.id] = Math.floor(Math.random() * 100);
    });

    const newData: Record<string, any[]> = {};

    POSITIONS_ORDER.forEach(pos => {
       if (pos === 'Grade Level Rep') {
          // Special handling to split by grade level
          const reps = mockCandidates.filter(c => c.position === 'Grade Level Rep');
          // Group by grade
          const grades = Array.from(new Set(reps.map(r => r.grade_level))).sort((a,b) => (a || 0) - (b || 0));
          
          grades.forEach(g => {
             if (!g) return; // skip if undefined
             const relevantCandidates = reps.filter(c => c.grade_level === g);
             const chartData = relevantCandidates.map(c => ({
                name: c.full_name,
                shortName: c.full_name.split(' ')[0], 
                votes: voteCounts[c.id] || 0,
                partylist: c.partylist,
                image: c.image_url
             }));
             newData[`Grade ${g} Representative`] = chartData;
          });

       } else {
           const relevantCandidates = mockCandidates.filter(c => c.position === pos);
           
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

    // Mock Turnout
    setTurnout({
      voted: Math.floor(mockVoters.length * 0.75) + 250, // Fake number
      total: 500
    });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Create a fake URL for preview since we don't have a real backend storage bucket in this demo
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    
    try {
      if (!formData.full_name || !formData.position) return;
      
      await addCandidate({
        full_name: formData.full_name,
        position: formData.position,
        partylist: formData.partylist || 'Independent',
        grade_level: formData.position === 'Grade Level Rep' ? formData.grade_level : undefined,
        image_url: imagePreview || "https://picsum.photos/200" // Fallback image
      });

      // Reset Form
      setFormData({
        full_name: '',
        position: POSITIONS_ORDER[0],
        partylist: '',
        grade_level: undefined,
      });
      setImagePreview(null);
      fetchData(); // Refresh list immediately
      alert("Candidate added successfully!");
    } catch (error) {
      console.error(error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if(window.confirm("Are you sure you want to delete this candidate?")) {
      await deleteCandidate(id);
      fetchData();
    }
  };

  const percentage = Math.round((turnout.voted / turnout.total) * 100);

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
            
            <nav className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg ml-8">
              <button 
                onClick={() => setActiveTab('canvassing')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'canvassing' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <BarChart3 size={16} /> Live Canvassing
              </button>
              <button 
                onClick={() => setActiveTab('candidates')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'candidates' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Users size={16} /> Manage Candidates
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
              {Object.entries(data).map(([pos, chartData]) => (
                <div key={pos} className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-200">{pos}</h3>
                    <RefreshCw size={14} className="text-slate-500 animate-spin-slow" />
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
                               onClick={() => handleDelete(candidate.id)}
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

      </div>
    </div>
  );
};

export default AdminDashboard;