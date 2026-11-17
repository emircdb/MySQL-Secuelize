const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/database');

const Actor = sequelize.define(
  'Actor',
  {
    id_actor: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    nombre_completo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
  },
  {
    tableName: 'actores',
    timestamps: false,
  }
);

module.exports = Actor;