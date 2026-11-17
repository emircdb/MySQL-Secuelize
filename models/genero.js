const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/database');

const Genero = sequelize.define(
  'Genero',
  {
    id_genero: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  },
  {
    tableName: 'generos',
    timestamps: false,
  }
);

module.exports = Genero;