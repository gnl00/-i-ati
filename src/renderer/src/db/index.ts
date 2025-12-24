import { openDB } from 'idb'

const DB_NAME = 'atiDB';
const CHAT_STORE = 'chatStore';
const MESSAGE_STORE = 'messageStore';
const CONFIG_STORE = 'configStore';
const DB_VERSION = 2;

// 打开数据库并创建存储对象
const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
          db.createObjectStore(CHAT_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        db.createObjectStore(MESSAGE_STORE, { keyPath: 'id', autoIncrement: true });
    }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
    }
  },
});

export {
  dbPromise,
  CHAT_STORE,
  MESSAGE_STORE,
  CONFIG_STORE
}