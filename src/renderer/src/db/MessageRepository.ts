import { dbPromise, MESSAGE_STORE as STORE_NAME } from './index'

// 添加数据
const saveMessage = async (data) => {
  const db = await dbPromise;
  return db.add(STORE_NAME, data);
};

// 获取所有数据
const getAllMessage = async () => {
  const db = await dbPromise;
  return db.getAll(STORE_NAME);
};

// 根据ID获取数据
const getMessageById = async (id) => {
  const db = await dbPromise;
  return db.get(STORE_NAME, id);
};

// 根据多个ID获取数据
const getMessageByIds = async (ids: number[]) => {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME);
  const store = tx.objectStore(STORE_NAME);
  const promises = ids.map(id => store.get(id));
  return Promise.all(promises);
};

// 更新数据
const updateMessage = async (data) => {
  const db = await dbPromise;
  return db.put(STORE_NAME, data);
};

// 删除数据
const deleteMessage = async (id) => {
  const db = await dbPromise;
  return db.delete(STORE_NAME, id);
};

export { saveMessage, getAllMessage, getMessageById, getMessageByIds, updateMessage, deleteMessage };