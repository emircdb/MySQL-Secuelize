const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/database');

const ContenidoGenero = sequelize.define(
  'ContenidoGenero',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_contenido: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_genero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'contenido_generos',
    timestamps: false,
  }
);

module.exports = ContenidoGenero;