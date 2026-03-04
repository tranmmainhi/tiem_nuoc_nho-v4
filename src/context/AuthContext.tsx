import React, { createContext, useContext, useState, useEffect } from 'react';
import { Staff, TimeSheet, Role } from '../types';

interface AuthContextType {
  currentUser: Staff | null;
  staffList: Staff[];
  timeSheets: TimeSheet[];
  login: (username: string, pin: string) => boolean;
  logout: () => void;
  checkIn: () => void;
  checkOut: () => void;
  addStaff: (staff: Omit<Staff, 'id'>) => void;
  updateStaff: (id: string, updates: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- Staff Management ---
  const [staffList, setStaffList] = useState<Staff[]>(() => {
    const saved = localStorage.getItem('staff_list');
    return saved ? JSON.parse(saved) : [
      // Default Admin Account
      { id: 'admin', username: 'admin', pin: '1234', name: 'Quản Lý', role: 'manager', active: true },
      // Default Staff Account
      { id: 'staff1', username: 'staff', pin: '0000', name: 'Nhân Viên 1', role: 'staff', active: true }
    ];
  });

  useEffect(() => {
    localStorage.setItem('staff_list', JSON.stringify(staffList));
  }, [staffList]);

  // --- Current Session ---
  const [currentUser, setCurrentUser] = useState<Staff | null>(() => {
    const saved = localStorage.getItem('current_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('current_user');
    }
  }, [currentUser]);

  // --- Time Sheets ---
  const [timeSheets, setTimeSheets] = useState<TimeSheet[]>(() => {
    const saved = localStorage.getItem('time_sheets');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('time_sheets', JSON.stringify(timeSheets));
  }, [timeSheets]);

  // --- Actions ---

  const login = (username: string, pin: string) => {
    const user = staffList.find(s => s.username === username && s.pin === pin && s.active);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const checkIn = () => {
    if (!currentUser) return;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Check if already checked in today without checkout?
    // For simplicity, allow multiple check-ins per day, create new entry
    const newEntry: TimeSheet = {
      id: Date.now().toString(),
      staffId: currentUser.id,
      checkIn: now.toISOString(),
      date: today
    };
    setTimeSheets(prev => [newEntry, ...prev]);
  };

  const checkOut = () => {
    if (!currentUser) return;
    // Find the latest open session for this user
    const openSession = timeSheets.find(t => t.staffId === currentUser.id && !t.checkOut);
    if (openSession) {
      const now = new Date();
      const checkInTime = new Date(openSession.checkIn);
      const diffMs = now.getTime() - checkInTime.getTime();
      const hours = diffMs / (1000 * 60 * 60);

      const updatedSession = {
        ...openSession,
        checkOut: now.toISOString(),
        totalHours: parseFloat(hours.toFixed(2))
      };

      setTimeSheets(prev => prev.map(t => t.id === openSession.id ? updatedSession : t));
    }
  };

  const addStaff = (staff: Omit<Staff, 'id'>) => {
    const newStaff = { ...staff, id: Date.now().toString() };
    setStaffList(prev => [...prev, newStaff]);
  };

  const updateStaff = (id: string, updates: Partial<Staff>) => {
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    // If updating current user, update session too
    if (currentUser && currentUser.id === id) {
      setCurrentUser(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const deleteStaff = (id: string) => {
    setStaffList(prev => prev.filter(s => s.id !== id));
    if (currentUser?.id === id) logout();
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      staffList,
      timeSheets,
      login,
      logout,
      checkIn,
      checkOut,
      addStaff,
      updateStaff,
      deleteStaff,
      isAdmin: currentUser?.role === 'manager',
      isAuthenticated: !!currentUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
