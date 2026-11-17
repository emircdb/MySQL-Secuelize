const Sequelize = require('sequelize');
require('dotenv').config();

const dbConfig = {
  database: process.env.DB_NAME || 'trailerflix',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'localhost',
  dialect: process.env.DB_DIALECT || 'mysql',
  define: {
    timestamps: false,
  },
  logging: false,
};

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    define: dbConfig.define,
    logging: dbConfig.logging,
  }
);

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log(`Conexión a ${dbConfig.dialect.toUpperCase()} (${dbConfig.database}) establecida correctamente.`);
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
  }
}

async function closeConnection() {
  try {
    await sequelize.close();
    console.log('Conexión cerrada correctamente.');
  } catch (error) {
    console.error('Error al cerrar la conexión:', error);
  }
}

module.exports = {
  sequelize,
  testConnection,
  closeConnection,
};