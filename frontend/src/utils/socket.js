import { io } from 'socket.io-client';

const URL = 'https://heykairo.onrender.com';
export const socket = io(URL, {
  autoConnect: false
});
