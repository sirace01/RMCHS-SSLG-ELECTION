import React, { useState } from 'react';
import Login from './components/Login';
import FlashScreen from './components/FlashScreen';
import Ballot from './components/Ballot';
import AdminDashboard from './components/AdminDashboard';
import { AppScreen, Voter } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.LOGIN);
  const [currentVoter, setCurrentVoter] = useState<Voter | null>(null);
  const [flashMode, setFlashMode] = useState<'voter' | 'admin' | 'logout'>('voter');

  const handleLoginSuccess = (voter: Voter) => {
    setCurrentVoter(voter);
    setFlashMode('voter');
    setCurrentScreen(AppScreen.FLASH);
  };

  const handleAdminLogin = () => {
    setFlashMode('admin');
    setCurrentScreen(AppScreen.FLASH);
  };

  const handleFlashComplete = () => {
    if (flashMode === 'voter') {
      setCurrentScreen(AppScreen.BALLOT);
    } else if (flashMode === 'admin') {
      setCurrentScreen(AppScreen.ADMIN);
    } else if (flashMode === 'logout') {
      setCurrentVoter(null);
      setCurrentScreen(AppScreen.LOGIN);
    }
  };

  const handleVoteSubmitted = () => {
    setCurrentScreen(AppScreen.SUCCESS);
  };

  const handleLogout = () => {
    setFlashMode('logout');
    setCurrentScreen(AppScreen.FLASH);
  };

  return (
    <div className="font-sans text-slate-900">
      <AnimatePresence mode="wait">
        {currentScreen === AppScreen.LOGIN && (
          <Login 
            key="login" 
            onLoginSuccess={handleLoginSuccess} 
            onAdminLogin={handleAdminLogin}
          />
        )}

        {currentScreen === AppScreen.FLASH && (
          <FlashScreen 
            key="flash" 
            voter={currentVoter}
            mode={flashMode}
            onComplete={handleFlashComplete} 
          />
        )}

        {currentScreen === AppScreen.BALLOT && currentVoter && (
          <motion.div
            key="ballot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Ballot 
              voter={currentVoter} 
              onVoteSubmitted={handleVoteSubmitted} 
              onLogout={handleLogout}
            />
          </motion.div>
        )}

        {currentScreen === AppScreen.SUCCESS && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-screen flex flex-col items-center justify-center bg-white p-8 text-center"
          >
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle size={48} className="text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Vote Submitted!</h1>
            <p className="text-gray-500 max-w-sm mx-auto mb-8">
              Thank you for participating in the SSLG Election. Your vote has been securely recorded and anonymized.
            </p>
            <button 
              onClick={handleLogout}
              className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition"
            >
              Back to Login
            </button>
          </motion.div>
        )}

        {currentScreen === AppScreen.ADMIN && (
          <AdminDashboard key="admin" onLogout={handleLogout} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;