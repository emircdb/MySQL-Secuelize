const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/database');

const Contenido = sequelize.define(
  'Contenido',
  {
    id_contenido: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    titulo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    categoria: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    sinopsis: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    temporadas: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    trailer: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: 'contenido',
    timestamps: false,
  }
);

module.exports = Contenido;