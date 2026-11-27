import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const SOCKET_URL = API_BASE.replace(/\/api$/, '');

export const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  withCredentials: true
});

export default socket;
