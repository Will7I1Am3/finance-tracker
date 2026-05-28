import { del, get, patch, post } from "./client";

export const deleteTransaction = (id) => del(`/transactions/${id}`);

export const createTransaction = (statementId, body) =>
  post(`/statements/${statementId}/transactions`, body);

export const getTransactions = (cardName) =>
  get(`/transactions${cardName ? `?card_name=${encodeURIComponent(cardName)}` : ""}`);

export const updateTransaction = (id, body) => patch(`/transactions/${id}`, body);

