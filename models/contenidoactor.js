const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/database');

const ContenidoActor = sequelize.define(
  'ContenidoActor',
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
    id_actor: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'contenido_actores',
    timestamps: false,
  }
);

module.exports = ContenidoActor;