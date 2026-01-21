import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, AlertTriangle, Send, LogOut, ChevronRight, X, ZoomIn } from 'lucide-react';
import { Voter, Candidate, POSITIONS_ORDER, VoteSelection } from '../types';
import { getCandidates, submitBallot } from '../lib/supabase'; // Real functions
import { cn } from '../lib/utils';

interface BallotProps {
  voter: Voter;
  onVoteSubmitted: () => void;
  onLogout: () => void;
}

const DEFAULT_PLACEHOLDER = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png";

const Ballot: React.FC<BallotProps> = ({ voter, onVoteSubmitted, onLogout }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selections, setSelections] = useState<VoteSelection>({});
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // State for the image lightbox
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => {
    const loadCandidates = async () => {
      setIsLoading(true);
      const allCandidates = await getCandidates();
      
      // Filter: Everyone sees main positions. Grade Level Reps only if matching grade.
      const filtered = allCandidates.filter(c => {
        if (c.position === 'Grade Level Rep') {
          return c.grade_level === voter.grade_level;
        }
        return true;
      });
      
      setCandidates(filtered);
      setIsLoading(false);
    };
    loadCandidates();
  }, [voter.grade_level]);

  // Group candidates by position
  const groupedCandidates = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    POSITIONS_ORDER.forEach(pos => {
      const displayPos = pos === 'Grade Level Rep' ? `Grade ${voter.grade_level} Representative` : pos;
      const cands = candidates.filter(c => c.position === pos);
      
      if (cands.length > 0) {
        groups[displayPos] = cands;
      }
    });
    return groups;
  }, [candidates, voter.grade_level]);

  const handleSelect = (positionKey: string, candidateId: string) => {
    setSelections(prev => ({
      ...prev,
      [positionKey]: candidateId
    }));
  };

  const isBallotComplete = useMemo(() => {
    const displayedPositions = Object.keys(groupedCandidates);
    return displayedPositions.every(pos => selections[pos]);
  }, [groupedCandidates, selections]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const success = await submitBallot(voter, selections);
      if (success) {
        onVoteSubmitted();
      } else {
        alert("Failed to submit vote. Please try again or contact an admin.");
        setIsSubmitting(false);
        setIsConfirming(false);
      }
    } catch (e) {
      alert("An unexpected error occurred.");
      setIsSubmitting(false);
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin" />
           <p className="text-gray-500 text-sm animate-pulse">Loading Candidates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-blue-900">Official Ballot</h1>
            <p className="text-xs text-gray-500">Logged in as: <span className="font-semibold">{voter.lrn}</span></p>
          </div>
          <button 
            onClick={onLogout}
            className="text-gray-500 hover:text-red-600 transition-colors p-2"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">
        {Object.entries(groupedCandidates).map(([position, candidatesInPosition], index) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            key={position} 
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="bg-blue-50/50 px-6 py-4 border-b border-blue-100">
              <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide">{position}</h2>
              <p className="text-sm text-blue-600">Select one (1)</p>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(candidatesInPosition as Candidate[]).map((candidate) => {
                const isSelected = selections[position] === candidate.id;
                return (
                  <div 
                    key={candidate.id}
                    onClick={() => handleSelect(position, candidate.id)}
                    className={cn(
                      "cursor-pointer group relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200",
                      isSelected 
                        ? "border-blue-600 bg-blue-50 shadow-md" 
                        : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                    )}
                  >
                    <div className="relative shrink-0 group/image">
                      <div className="relative w-16 h-16">
                        <img 
                          src={candidate.image_url || DEFAULT_PLACEHOLDER} 
                          alt={candidate.full_name} 
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm cursor-zoom-in hover:scale-105 transition-transform"
                          onClick={(e) => {
                            e.stopPropagation(); // Stop bubbling so we don't select the candidate
                            setZoomedImage(candidate.image_url || DEFAULT_PLACEHOLDER);
                          }}
                        />
                         <div className="absolute inset-0 rounded-full bg-black/20 opacity-0 group-hover/image:opacity-100 flex items-center justify-center pointer-events-none transition-opacity">
                            <ZoomIn size={14} className="text-white drop-shadow-md" />
                         </div>
                      </div>
                      
                      {isSelected && (
                        <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 z-10 pointer-events-none">
                          <CheckCircle2 size={16} fill="currentColor" className="text-blue-600 bg-white rounded-full" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{candidate.full_name}</h3>
                      <p className="text-sm text-gray-500">{candidate.partylist || "Independent"}</p>
                    </div>
                  </div>
                );
              })}

              {/* Abstain Option */}
              <div 
                onClick={() => handleSelect(position, 'ABSTAIN')}
                className={cn(
                  "cursor-pointer flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-dashed transition-all duration-200 h-24",
                  selections[position] === 'ABSTAIN'
                    ? "border-gray-600 bg-gray-100 text-gray-800" 
                    : "border-gray-300 text-gray-400 hover:border-gray-400 hover:bg-gray-50"
                )}
              >
                <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", selections[position] === 'ABSTAIN' ? "border-gray-800" : "border-gray-400")}>
                   {selections[position] === 'ABSTAIN' && <div className="w-2.5 h-2.5 rounded-full bg-gray-800" />}
                </div>
                <span className="font-medium">Abstain</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center z-30">
        <button
          onClick={() => setIsConfirming(true)}
          disabled={!isBallotComplete}
          className={cn(
            "flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg shadow-xl transition-all transform",
            isBallotComplete 
              ? "bg-blue-900 text-white hover:scale-105 hover:bg-blue-800" 
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          )}
        >
          Review & Submit <ChevronRight size={20} />
        </button>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="bg-blue-900 p-6 text-white flex items-center gap-4">
                <AlertTriangle className="text-yellow-400" size={28} />
                <div>
                  <h3 className="text-xl font-bold">Confirm Votes</h3>
                  <p className="text-blue-200 text-sm">Action cannot be undone.</p>
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {Object.entries(groupedCandidates).map(([pos, _]) => {
                  const selectionId = selections[pos];
                  const candidate = candidates.find(c => c.id === selectionId);
                  const isAbstain = selectionId === 'ABSTAIN';

                  return (
                    <div key={pos} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm font-medium text-gray-500 uppercase">{pos}</span>
                      <span className={cn("font-bold", isAbstain ? "text-gray-400 italic" : "text-blue-900")}>
                        {isAbstain ? "Abstained" : candidate?.full_name}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="p-6 bg-gray-50 border-t flex gap-3">
                <button 
                  onClick={() => setIsConfirming(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 flex justify-center items-center gap-2"
                >
                  {isSubmitting ? <span className="animate-spin text-xl">⏳</span> : <><Send size={18} /> Cast Vote</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Zoom Lightbox */}
      <AnimatePresence>
        {zoomedImage && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
            onClick={() => setZoomedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()} // Clicking the image/container shouldn't close it, only backdrop
            >
               <div className="relative">
                  <img 
                    src={zoomedImage} 
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border-4 border-white/20" 
                    alt="Candidate Zoom"
                  />
                  <button 
                     className="absolute -top-12 -right-4 md:-right-12 text-white/80 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full p-2 backdrop-blur-sm"
                     onClick={() => setZoomedImage(null)}
                  >
                    <X size={28} />
                  </button>
               </div>
               <p className="text-white/60 text-sm mt-4">Click anywhere outside to close</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Ballot;