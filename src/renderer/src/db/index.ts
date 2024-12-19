import { openDB } from 'idb'

const DB_NAME = 'atiDB';
const CHAT_STORE = 'chatStore';
const MESSAGE_STORE = 'messageStore';
const DB_VERSION = 1;

// 打开数据库并创建存储对象
const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
          db.createObjectStore(CHAT_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        db.createObjectStore(MESSAGE_STORE, { keyPath: 'id', autoIncrement: true });
    }
  },
});

export {
  dbPromise,
  CHAT_STORE,
  MESSAGE_STORE
}