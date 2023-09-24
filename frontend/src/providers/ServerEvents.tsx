import React, { createContext, useContext, ReactNode } from 'react';

interface ServerEventsProviderProps {
  timeLeft: number;
}

const ServerEventsContext = createContext<ServerEventsProviderProps | undefined>(undefined);

// FINISH THIS