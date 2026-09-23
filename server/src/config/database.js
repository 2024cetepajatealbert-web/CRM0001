const mysql = require("mysql2/promise");

class Database {
  constructor() {
    this.pool = null;
  }

  connect() {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: "utf8mb4",
      });
    }
    return this.pool;
  }

  async query(sql, values = []) {
    const [rows] = await this.connect().execute(sql, values);
    return rows;
  }

  async transaction(work) {
    const connection = await this.connect().getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

module.exports = new Database();
