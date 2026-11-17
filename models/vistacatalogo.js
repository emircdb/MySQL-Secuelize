const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/database');

const VistaCatalogo = sequelize.define(
  'VistaCatalogo',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    titulo: {
      type: DataTypes.STRING(150),
    },
    categoria: {
      type: DataTypes.STRING(50),
    },
    genero: {
      type: DataTypes.TEXT,
    },
    sinopsis: {
      type: DataTypes.TEXT,
    },
    temporadas: {
      type: DataTypes.STRING(20),
    },
    reparto: {
      type: DataTypes.TEXT,
    },
    trailer: {
      type: DataTypes.STRING(255),
    },
  },
  {
    tableName: 'vista_catalogo',
    timestamps: false,
  }
);

module.exports = VistaCatalogo;