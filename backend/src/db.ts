import { genesisHash, genesisResponse } from "common";
import sqlite3 from "sqlite3";

export type Entry = {
  hash: string;
  nonce: string;
  prompt: string;
  response: string;
};

const db = new sqlite3.Database("./db.sqlite", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connected to the database.");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      hash TEXT NOT NULL,
      nonce TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL
    )
  `);
});

type EntryRow = {
  id: number;
  hash: string;
  nonce: string;
  prompt: string;
  response: string;
};

export const writeEntry = (entry: Entry) => {
  console.log("writing entry", entry);
  db.run(
    `INSERT INTO entries(hash, nonce, prompt, response) VALUES(?, ?, ?, ?)`,
    [entry.hash, entry.nonce, entry.prompt, entry.response],
    function (err) {
      if (err) {
        return console.error(err.message);
      }

      console.log(`A row has been inserted with rowid ${this.lastID}`);
    }
  );
};

export const lastState = async () =>
  new Promise<{
    count: number;
    prevHash: string;
    prevResponse: string;
  }>((resolve, reject) => {
    db.get(
      "SELECT * FROM entries ORDER BY id DESC LIMIT 1",
      [],
      (err, row: EntryRow) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          resolve({
            count: row.id,
            prevHash: row.hash,
            prevResponse: row.response,
          });
          return;
        }
        resolve({
          count: 0,
          prevHash: genesisHash,
          prevResponse: genesisResponse,
        });
      }
    );
  });

export const getLastEntries = async (count: number) => {
  return new Promise<Entry[]>((resolve, reject) => {
    db.all(
      "SELECT * FROM entries ORDER BY id DESC LIMIT ?",
      [count],
      (err, rows: EntryRow[]) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(
          rows.map((row) => ({
            hash: row.hash,
            nonce: row.nonce,
            prompt: row.prompt,
            response: row.response,
          }))
        );
      }
    );
  });
};

export const getChatHistory = (from: number, to: number) =>
  new Promise<
    {
      id: number;
      prompt: string;
      response: string;
    }[]
  >((resolve, reject) => {
    db.all(
      "SELECT * FROM entries WHERE id >= ? AND id <= ? ORDER BY id ASC",
      [from, to],
      (err, rows: EntryRow[]) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(
          rows.map((row) => ({
            id: row.id,
            prompt: row.prompt,
            response: row.response,
          }))
        );
      }
    );
  });
