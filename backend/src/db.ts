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
