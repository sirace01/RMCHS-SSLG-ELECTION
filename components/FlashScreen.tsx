import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { SCHOOL_LOGO_URL, SSLG_LOGO_URL, Voter } from '../types';

interface FlashScreenProps {
  voter: Voter;
  onComplete: () => void;
}

const FlashScreen: React.FC<FlashScreenProps> = ({ voter, onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3500); // 3.5 seconds total

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center overflow-hidden">
      {/* Background Decoration */}
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 20, opacity: 0.05 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute w-64 h-64 bg-green-500 rounded-full"
      />

      <div className="flex items-center gap-8 md:gap-16 z-10 relative">
        <motion.img
          initial={{ x: -100, opacity: 0, rotate: -45 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
          src={SCHOOL_LOGO_URL}
          alt="School Logo"
          className="w-24 h-24 md:w-40 md:h-40 object-contain rounded-full drop-shadow-xl"
        />
        
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          transition={{ delay: 0.5, type: 'spring' }}
          className="h-16 w-1 bg-gray-300 rounded-full"
        />

        <motion.img
          initial={{ x: 100, opacity: 0, rotate: 45 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
          src={SSLG_LOGO_URL}
          alt="SSLG Logo"
          className="w-24 h-24 md:w-40 md:h-40 object-contain rounded-full drop-shadow-xl"
        />
      </div>

      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="mt-12 text-center z-10"
      >
        <h2 className="text-3xl md:text-5xl font-black text-green-800 tracking-tight">
          WELCOME
        </h2>
        <h3 className="text-xl md:text-2xl font-bold text-gray-700 mt-2">
          {voter.first_name} {voter.last_name}
        </h3>
        <p className="text-green-600 font-medium mt-1">Grade {voter.grade_level}</p>
        
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: 1.5, duration: 2 }}
          className="h-1.5 bg-yellow-400 mt-6 mx-auto rounded-full max-w-[200px]"
        />
        <p className="text-gray-400 text-xs mt-2 uppercase tracking-widest">Loading Ballot...</p>
      </motion.div>
    </div>
  );
};

export default FlashScreen;