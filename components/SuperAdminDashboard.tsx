import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Swal from 'sweetalert2';
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
  setSchoolYear,
  getAdminLrn,
  updateAdminCredentials,
  wipeAllVoters,
  wipeAllCandidates,
  factoryResetElection
} from '../lib/supabase';
import { Candidate, Voter, POSITIONS_ORDER } from '../types';
import { LogOut, RefreshCw, Users, BarChart3, Plus, Trash2, Upload, Image as ImageIcon, FileSpreadsheet, UserPlus, CheckCircle2, XCircle, Download, Printer, Lock, Unlock, Database, Copy, Save, Key, Shield, Settings, Siren, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdminDashboardProps {
  onLogout: () => void;
}

type Tab = 'canvassing' | 'candidates' | 'voters' | 'danger';

interface ChartDataPoint {
  name: string;
  shortName: string;
  votes: number;
  partylist?: string;
  image?: string;
  id: string;
  grades: Record<string, number>;
}

const DEFAULT_PLACEHOLDER = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png";
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
-- Admin Credentials (LRN: 111111111111, Pass: SSLGRMCHS@2026)
INSERT INTO config (key, value) VALUES ('admin_lrn', '111111111111') ON CONFLICT DO NOTHING;
INSERT INTO config (key, value) VALUES ('admin_password', 'SSLGRMCHS@2026') ON CONFLICT DO NOTHING;
-- Super Admin Credentials (Username: SUPERADMIN, Pass: ADMINSUPER)
INSERT INTO config (key, value) VALUES ('superadmin_username', 'SUPERADMIN') ON CONFLICT DO NOTHING;
INSERT INTO config (key, value) VALUES ('superadmin_password', 'ADMINSUPER') ON CONFLICT DO NOTHING;

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

const SuperAdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('danger');
  const [data, setData] = useState<Record<string, ChartDataPoint[]>>({});
  const [turnout, setTurnout] = useState({ voted: 0, total: 0 });
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  const [adminLrn, setAdminLrn] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  
  const [showSqlHelp, setShowSqlHelp] = useState(false);
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
  });

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const cList: Candidate[] = await getCandidates();
      const vList: Voter[] = await getAllVoters();
      const allVotes = await getAllVotes();

      const voteMap: Record<string, { total: number, grades: Record<string, number> }> = {};
      allVotes.forEach(vote => {
        if (!vote.candidate_id) return;
        if (!voteMap[vote.candidate_id]) voteMap[vote.candidate_id] = { total: 0, grades: {} };
        voteMap[vote.candidate_id].total += 1;
        const gradeKey = vote.grade_level ? vote.grade_level.toString() : 'Unknown';
        voteMap[vote.candidate_id].grades[gradeKey] = (voteMap[vote.candidate_id].grades[gradeKey] || 0) + 1;
      });

      const newData: Record<string, ChartDataPoint[]> = {};
      POSITIONS_ORDER.forEach(pos => {
         if (pos === 'Grade Level Rep') {
            const reps = cList.filter(c => c.position === 'Grade Level Rep');
            const grades = Array.from(new Set(reps.map(r => r.grade_level))).sort((a,b) => (a || 0) - (b || 0));
            grades.forEach(g => {
               if (!g) return;
               const relevantCandidates = reps.filter(c => c.grade_level === g);
               if (relevantCandidates.length > 0) {
                 newData[`Grade ${g} Representative`] = relevantCandidates.map(c => ({
                    id: c.id,
                    name: c.full_name,
                    shortName: c.full_name.split(' ')[0], 
                    votes: voteMap[c.id]?.total || 0,
                    partylist: c.partylist,
                    image: c.image_url,
                    grades: voteMap[c.id]?.grades || {}
                 })).sort((a, b) => b.votes - a.votes);
               }
            });
         } else {
             const relevantCandidates = cList.filter(c => c.position === pos);
             if (relevantCandidates.length > 0) {
               newData[pos] = relevantCandidates.map(c => ({
                 id: c.id,
                 name: c.full_name,
                 shortName: c.full_name.split(' ')[0], 
                 votes: voteMap[c.id]?.total || 0,
                 partylist: c.partylist,
                 image: c.image_url,
                 grades: voteMap[c.id]?.grades || {}
               })).sort((a, b) => b.votes - a.votes);
             }
         }
      });

      setData(newData);
      setTurnout({ voted: vList.filter(v => v.has_voted).length, total: vList.length });
    } catch (e) {
      console.error("Failed to load super admin data", e);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminLrn) return Swal.fire('Error', 'Username cannot be empty', 'error');
    setIsUpdatingSettings(true);
    try {
      await updateAdminCredentials(adminLrn, newPassword || undefined);
      Swal.fire('Success', 'Admin credentials updated.', 'success');
      setNewPassword("");
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleWipe = async (type: 'voters' | 'candidates' | 'all') => {
    const result = await Swal.fire({
      title: 'ARE YOU SURE?',
      text: "You are entering the DANGER ZONE. This action cannot be undone.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, WIPE IT',
      background: '#1a1a1a',
      color: '#fff'
    });

    if (result.isConfirmed) {
      try {
        if (type === 'voters') {
          await wipeAllVoters();
          Swal.fire('Wiped', 'All voters have been deleted.', 'success');
        } else if (type === 'candidates') {
          await wipeAllCandidates();
          Swal.fire('Wiped', 'All candidates and votes have been deleted.', 'success');
        } else {
          await factoryResetElection();
          Swal.fire('Reset', 'System fully reset. Election is fresh.', 'success');
        }
        fetchData();
      } catch (e: any) {
        Swal.fire('Error', e.message, 'error');
      }
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SETUP_SQL_SCRIPT);
    Toast.fire({ icon: 'success', title: 'SQL Copied' });
  };

  return (
    <>
      <div className="min-h-screen bg-neutral-950 text-red-50 font-sans">
        <div className="bg-red-950/30 border-b border-red-900 sticky top-0 z-40 shadow-2xl backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                 <div className="bg-red-600 p-2 rounded-lg">
                    <Siren size={20} className="text-white animate-pulse" />
                 </div>
                 <div>
                   <h1 className="text-xl font-black tracking-tighter text-red-500 uppercase">SUPER ADMIN</h1>
                   <p className="text-[10px] text-red-400">System Root Access</p>
                 </div>
              </div>
              
              <nav className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveTab('danger')}
                  className={cn(
                    "px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2",
                    activeTab === 'danger' ? "bg-red-600 text-white shadow-lg shadow-red-900/50" : "text-red-400 hover:bg-red-900/50"
                  )}
                >
                  <AlertTriangle size={16} /> DANGER ZONE
                </button>
                <button 
                  onClick={() => setActiveTab('canvassing')}
                  className={cn(
                    "px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2",
                    activeTab === 'canvassing' ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-white"
                  )}
                >
                  <BarChart3 size={16} /> Monitor
                </button>
                 <button onClick={onLogout} className="ml-4 flex items-center gap-2 text-neutral-500 hover:text-white text-sm font-bold">
                   <LogOut size={16} /> EXIT
                 </button>
              </nav>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-8">
          
          {activeTab === 'danger' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8">
               
               {/* Setup Admin */}
               <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                     <Shield size={100} />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                    <Key className="text-yellow-500" /> Setup Regular Admin
                  </h2>
                  <form onSubmit={handleUpdateAdmin} className="max-w-md space-y-4 relative z-10">
                    <div>
                      <label className="text-xs font-bold text-neutral-500 uppercase">Admin Username (LRN)</label>
                      <input 
                        type="text" 
                        value={adminLrn}
                        onChange={e => setAdminLrn(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none font-mono"
                        placeholder="111111111111"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-neutral-500 uppercase">New Password</label>
                      <input 
                        type="password" 
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                        placeholder="Leave blank to keep current"
                      />
                    </div>
                    <button type="submit" className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-6 rounded-lg transition w-full">
                       {isUpdatingSettings ? 'Saving...' : 'Update Admin Credentials'}
                    </button>
                  </form>
               </div>

               {/* Database Fixer */}
               <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                     <Database className="text-blue-500" /> Database Setup Script
                  </h2>
                  <p className="text-neutral-400 text-sm mb-4">
                     If the system is broken or new, run this SQL in Supabase. It includes SuperAdmin and Admin defaults.
                  </p>
                  <button 
                    onClick={() => setShowSqlHelp(!showSqlHelp)}
                    className="bg-blue-900/30 text-blue-400 border border-blue-800 hover:bg-blue-900/50 px-4 py-2 rounded-lg text-sm font-bold transition"
                  >
                    {showSqlHelp ? 'Hide SQL Script' : 'Show SQL Script'}
                  </button>
                  {showSqlHelp && (
                    <div className="mt-4 relative">
                       <pre className="bg-black border border-neutral-800 p-4 rounded-lg text-xs font-mono text-green-500 overflow-x-auto h-64">
                          {SETUP_SQL_SCRIPT}
                       </pre>
                       <button onClick={handleCopySql} className="absolute top-2 right-2 p-2 bg-neutral-800 rounded text-white hover:bg-neutral-700">
                          <Copy size={14} />
                       </button>
                    </div>
                  )}
               </div>

               {/* Destructive Actions */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-6 hover:bg-red-900/30 transition duration-300">
                     <Users size={32} className="text-red-500 mb-4" />
                     <h3 className="text-lg font-bold text-red-200">Wipe Voters</h3>
                     <p className="text-xs text-red-400/60 mb-6">Deletes all registered voters. Passcodes will be lost.</p>
                     <button onClick={() => handleWipe('voters')} className="w-full py-2 rounded-lg border border-red-800 text-red-500 hover:bg-red-900 font-bold text-sm">
                        Wipe Voters DB
                     </button>
                  </div>

                  <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-6 hover:bg-red-900/30 transition duration-300">
                     <Users size={32} className="text-orange-500 mb-4" />
                     <h3 className="text-lg font-bold text-orange-200">Wipe Candidates</h3>
                     <p className="text-xs text-orange-400/60 mb-6">Deletes candidates AND all votes cast for them.</p>
                     <button onClick={() => handleWipe('candidates')} className="w-full py-2 rounded-lg border border-orange-800 text-orange-500 hover:bg-orange-900 font-bold text-sm">
                        Wipe Candidates DB
                     </button>
                  </div>

                  <div className="bg-red-600 rounded-2xl p-6 shadow-lg shadow-red-900/50 transform hover:scale-105 transition duration-300">
                     <AlertTriangle size={32} className="text-white mb-4" />
                     <h3 className="text-lg font-bold text-white">FACTORY RESET</h3>
                     <p className="text-xs text-red-200 mb-6">Deletes EVERYTHING. Voters, Candidates, Votes. Starts fresh.</p>
                     <button onClick={() => handleWipe('all')} className="w-full py-2 rounded-lg bg-white text-red-700 hover:bg-neutral-200 font-black text-sm">
                        FULL SYSTEM RESET
                     </button>
                  </div>
               </div>

            </div>
          )}

          {activeTab === 'canvassing' && (
            <div className="space-y-6">
               <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
                  <h2 className="text-2xl font-bold mb-2">Live Monitor</h2>
                  <p className="text-neutral-500">Votes: {turnout.voted}</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(data).map(([pos, chartData]) => (
                     <div key={pos} className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                        <h3 className="text-lg font-bold mb-4">{pos}</h3>
                        <div className="h-48">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} layout="vertical">
                                 <XAxis type="number" hide />
                                 <YAxis dataKey="shortName" type="category" width={80} stroke="#666" fontSize={10} />
                                 <Bar dataKey="votes" fill="#ef4444" barSize={15} radius={[0,4,4,0]} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default SuperAdminDashboard;