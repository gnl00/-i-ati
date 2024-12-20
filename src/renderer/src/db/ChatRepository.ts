import { dbPromise, CHAT_STORE as STORE_NAME } from './index'

// 添加数据
const saveChat = async (data) => {
  const db = await dbPromise;
  return db.add(STORE_NAME, data);
};

// 获取所有数据
const getAllChat = async () => {
  const db = await dbPromise;
  return db.getAll(STORE_NAME);
};

// 根据ID获取数据
const getChatById = async (id) => {
  const db = await dbPromise;
  return db.get(STORE_NAME, id);
};

// 更新数据
const updateChat = async (data) => {
  const db = await dbPromise;
  return db.put(STORE_NAME, data);
};

// 删除数据
const deleteChat = async (id) => {
  const db = await dbPromise;
  return db.delete(STORE_NAME, id);
};

export { saveChat, getAllChat, getChatById, updateChat, deleteChat };

export interface ChatEntity {
  id?: number; // 自增 id
  uuid: string;
  title: string; // 用户名
  messages: number[]; // 消息内容
  updateTime: number; // 更新时间
  createTime: number; // 创建时间
}