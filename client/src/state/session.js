// Persistencia ligera de sesión en localStorage.
// El acceso a la web ya NO se guarda aquí: vive en una cookie httpOnly puesta por el
// servidor. Solo persistimos la sala para poder reconectar tras recargar o caída.

const KEYS = {
  roomCode: 'vm_roomCode',
  playerId: 'vm_playerId',
  nickname: 'vm_nickname',
};

export const session = {
  getRoom: () => ({
    code: localStorage.getItem(KEYS.roomCode),
    playerId: localStorage.getItem(KEYS.playerId),
    nickname: localStorage.getItem(KEYS.nickname),
  }),
  setRoom(code, playerId, nickname) {
    localStorage.setItem(KEYS.roomCode, code);
    localStorage.setItem(KEYS.playerId, playerId);
    if (nickname) localStorage.setItem(KEYS.nickname, nickname);
  },
  clearRoom() {
    localStorage.removeItem(KEYS.roomCode);
    localStorage.removeItem(KEYS.playerId);
  },
};
