const express = require('express');
const { Op, col, fn, where } = require('sequelize');
require('dotenv').config();

const { sequelize, testConnection, closeConnection } = require('./src/database');
const VistaCatalogo = require('./models/vistacatalogo');
const Contenido = require('./models/contenido');
const ContenidoGenero = require('./models/contenidogenero');
const ContenidoActor = require('./models/contenidoactor');
const Genero = require('./models/genero');
const Actor = require('./models/actor');

const app = express();
const PORT = process.env.PORT || 3008;

app.use(express.json());

const camposContenido = new Set([
  'titulo',
  'categoria',
  'sinopsis',
  'temporadas',
  'trailer',
]);

function isNonEmptyString(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isValidId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647;
}

function parseQueryInteger(value, minimum) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function normalizeText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function validateTemporadasPorCategoria(categoria, temporadas) {
  if (
    typeof categoria === 'string' &&
    normalizeText(categoria) === 'pelicula' &&
    temporadas !== null &&
    temporadas !== undefined
  ) {
    return 'Una película no puede tener temporadas; omite el campo o envía null';
  }

  return null;
}

function normalizeCategoryColumn() {
  let expression = fn('LOWER', col('categoria'));

  for (const [accented, plain] of [
    ['á', 'a'],
    ['é', 'e'],
    ['í', 'i'],
    ['ó', 'o'],
    ['ú', 'u'],
    ['ü', 'u'],
    ['ñ', 'n'],
  ]) {
    expression = fn('REPLACE', expression, accented, plain);
  }

  return expression;
}

class InvalidAssociationIdsError extends Error {
  constructor(field, ids) {
    super(`No existen estos IDs en ${field}: ${ids.join(', ')}`);
    this.name = 'InvalidAssociationIdsError';
  }
}

async function assertAssociationIdsExist(
  Model,
  idField,
  ids,
  field,
  transaction
) {
  if (ids.length === 0) {
    return;
  }

  const records = await Model.findAll({
    where: { [idField]: { [Op.in]: ids } },
    attributes: [idField],
    transaction,
  });
  const foundIds = new Set(records.map((record) => record.get(idField)));
  const missingIds = ids.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw new InvalidAssociationIdsError(field, missingIds);
  }
}

function validateContenido(
  body,
  { partial = false, allowAssociations = false } = {}
) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'El cuerpo debe ser un objeto JSON';
  }

  const fields = Object.keys(body);
  if (fields.length === 0) {
    return 'El cuerpo debe incluir al menos un campo';
  }

  const allowedFields = allowAssociations
    ? new Set([...camposContenido, 'generos', 'actores'])
    : camposContenido;
  const unknownFields = fields.filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    return `Campos no permitidos: ${unknownFields.join(', ')}`;
  }

  if (!partial) {
    const requiredFields = ['titulo', 'categoria', 'sinopsis'];
    const missingFields = requiredFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(body, field)
    );

    if (missingFields.length > 0) {
      return `Faltan campos obligatorios: ${missingFields.join(', ')}`;
    }
  }

  const stringFields = [
    ['titulo', 150],
    ['categoria', 50],
    ['sinopsis', Infinity],
    ['trailer', 255],
  ];

  for (const [field, maxLength] of stringFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      continue;
    }

    if (field === 'trailer' && body[field] === null) {
      continue;
    }

    if (!isNonEmptyString(body[field], maxLength)) {
      const lengthRule = Number.isFinite(maxLength)
        ? ` de hasta ${maxLength} caracteres`
        : '';
      return `El campo ${field} debe ser un texto no vacío${lengthRule}`;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'temporadas') &&
    body.temporadas !== null &&
    (!Number.isInteger(body.temporadas) || body.temporadas < 1)
  ) {
    return 'El campo temporadas debe ser un entero positivo o null';
  }

  const categorySeasonsError = validateTemporadasPorCategoria(
    body.categoria,
    body.temporadas
  );
  if (categorySeasonsError) {
    return categorySeasonsError;
  }

  if (allowAssociations) {
    for (const field of ['generos', 'actores']) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) {
        continue;
      }

      const ids = body[field];
      if (!Array.isArray(ids)) {
        return `El campo ${field} debe ser un arreglo de IDs`;
      }

      if (
        ids.some(
          (id) =>
            !Number.isInteger(id) ||
            id < 1 ||
            id > 2147483647
        )
      ) {
        return `Todos los IDs de ${field} deben ser enteros positivos válidos`;
      }

      if (new Set(ids).size !== ids.length) {
        return `El arreglo ${field} no debe contener IDs duplicados`;
      }
    }
  }

  return null;
}

// Ruta raíz
app.get('/', (req, res) => {
  res.send('\nBienvenido a la API de Trailerflix con MySQL y Sequelize\n');
});

// Consultas al catálogo
app.get('/catalogo/resumen', async (req, res) => {
  try {
    const [totalTitulos, series, peliculas, generos, actores] =
      await Promise.all([
        Contenido.count(),
        Contenido.count({
          where: where(normalizeCategoryColumn(), {
            [Op.eq]: normalizeText('Serie'),
          }),
        }),
        Contenido.count({
          where: where(normalizeCategoryColumn(), {
            [Op.eq]: normalizeText('Película'),
          }),
        }),
        Genero.count(),
        Actor.count(),
      ]);

    res.json({ totalTitulos, series, peliculas, generos, actores });
  } catch (error) {
    console.error('Error al consultar el resumen del catálogo:', error);
    res.status(500).json({ error: 'Error al consultar el resumen del catálogo' });
  }
});

app.get('/generos', async (req, res) => {
  try {
    const generos = await Genero.findAll({ order: [['nombre', 'ASC']] });
    res.json(generos);
  } catch (error) {
    console.error('Error al consultar los géneros:', error);
    res.status(500).json({ error: 'Error al consultar los géneros' });
  }
});

app.get('/actores', async (req, res) => {
  try {
    const actores = await Actor.findAll({
      order: [['nombre_completo', 'ASC']],
    });
    res.json(actores);
  } catch (error) {
    console.error('Error al consultar los actores:', error);
    res.status(500).json({ error: 'Error al consultar los actores' });
  }
});

app.get('/catalogo', async (req, res) => {
  try {
    const { categoria, titulo, genero, order, orden, limit, offset } = req.query;
    const where = {};

    if (categoria !== undefined && !isNonEmptyString(categoria, 50)) {
      return res.status(400).json({
        error: 'El parámetro categoria debe ser un texto no vacío de hasta 50 caracteres',
      });
    }

    if (titulo !== undefined && !isNonEmptyString(titulo, 150)) {
      return res.status(400).json({
        error: 'El parámetro titulo debe ser un texto no vacío de hasta 150 caracteres',
      });
    }

    if (genero !== undefined && !isNonEmptyString(genero, 50)) {
      return res.status(400).json({
        error: 'El parámetro genero debe ser un texto no vacío de hasta 50 caracteres',
      });
    }

    if (
      order !== undefined &&
      (typeof order !== 'string' ||
        !['id', 'titulo'].includes(order.trim().toLowerCase()))
    ) {
      return res.status(400).json({
        error: 'El parámetro order debe ser id o titulo',
      });
    }

    if (
      orden !== undefined &&
      (typeof orden !== 'string' ||
        !['ASC', 'DESC'].includes(orden.trim().toUpperCase()))
    ) {
      return res.status(400).json({ error: 'El parámetro orden debe ser ASC o DESC' });
    }

    const parsedLimit =
      limit === undefined ? undefined : parseQueryInteger(limit, 1);
    if (limit !== undefined && parsedLimit === null) {
      return res.status(400).json({
        error: 'El parámetro limit debe ser un entero positivo',
      });
    }

    const parsedOffset =
      offset === undefined ? undefined : parseQueryInteger(offset, 0);
    if (offset !== undefined && parsedOffset === null) {
      return res.status(400).json({
        error: 'El parámetro offset debe ser un entero igual o mayor que cero',
      });
    }

    if (categoria !== undefined) {
      where.categoria = { [Op.like]: `%${categoria}%` };
    }

    if (titulo !== undefined) {
      where.titulo = { [Op.like]: `%${titulo}%` };
    }

    if (genero !== undefined) {
      where.genero = { [Op.like]: `%${genero}%` };
    }

    const orderField = order ? order.trim().toLowerCase() : 'id';
    const orderDirection = orden ? orden.trim().toUpperCase() : 'ASC';
    const opciones = {
      where,
      order: [[orderField, orderDirection]],
    };

    if (parsedLimit !== undefined) {
      opciones.limit = parsedLimit;
    }

    if (parsedOffset !== undefined) {
      opciones.offset = parsedOffset;
    }

    const catalogo = await VistaCatalogo.findAll(opciones);

    const filtrosActivos = Object.entries({ categoria, titulo, genero }).filter(
      ([, value]) => value !== undefined
    );
    if (catalogo.length === 0 && filtrosActivos.length > 0) {
      const filtrosBuscados = filtrosActivos
        .map(([campo, valor]) => `${campo}: ${valor}`)
        .join(', ');

      return res.status(404).json({
        error: `No se encontraron resultados para ${filtrosBuscados}`,
      });
    }

    res.json(catalogo);
  } catch (error) {
    console.error('Error al consultar el catálogo:', error);
    res.status(500).json({ error: 'Error al consultar el catálogo' });
  }
});

// Búsqueda parcial por título
app.get('/titulo/:title', async (req, res) => {
  try {
    const { title } = req.params;
    if (!isNonEmptyString(title, 150)) {
      return res.status(400).json({
        error: 'El título de búsqueda debe ser un texto no vacío de hasta 150 caracteres',
      });
    }

    const resultados = await VistaCatalogo.findAll({
      where: { titulo: { [Op.like]: `%${title}%` } },
    });

    if (resultados.length === 0) {
      return res.status(404).json({
        error: `No se encontraron títulos que coincidan con "${title}"`,
      });
    }

    res.json(resultados);
  } catch (error) {
    console.error('Error al buscar por título:', error);
    res.status(500).json({ error: 'Error al buscar por título' });
  }
});

// Filtrar por categoría
app.get('/categoria/:cat', async (req, res) => {
  try {
    const { cat } = req.params;
    if (!isNonEmptyString(cat, 50)) {
      return res.status(400).json({
        error: 'La categoría debe ser un texto no vacío de hasta 50 caracteres',
      });
    }

    const resultados = await VistaCatalogo.findAll({
      where: where(normalizeCategoryColumn(), {
        [Op.like]: `%${normalizeText(cat)}%`,
      }),
    });

    if (resultados.length === 0) {
      return res.status(404).json({
        error: `No se encontró contenido para la categoría "${cat}"`,
      });
    }

    res.json(resultados);
  } catch (error) {
    console.error('Error al filtrar por categoría:', error);
    res.status(500).json({ error: 'Error al filtrar por categoría' });
  }
});

// Buscar por actor o actriz
app.get('/reparto/:act', async (req, res) => {
  try {
    const { act } = req.params;
    if (!isNonEmptyString(act, 150)) {
      return res.status(400).json({
        error: 'El nombre de búsqueda debe ser un texto no vacío de hasta 150 caracteres',
      });
    }

    const resultados = await VistaCatalogo.findAll({
      where: { reparto: { [Op.like]: `%${act}%` } },
      attributes: ['titulo', 'reparto'],
    });

    if (resultados.length === 0) {
      return res.status(404).json({
        error: `No se encontró ningún actor o actriz que coincida con "${act}"`,
      });
    }

    res.json(resultados);
  } catch (error) {
    console.error('Error al buscar por reparto:', error);
    res.status(500).json({ error: 'Error al buscar por reparto' });
  }
});

// Consultar el tráiler de un contenido
app.get('/trailer/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo válido' });
    }

    const item = await VistaCatalogo.findByPk(id, {
      attributes: ['id', 'titulo', 'trailer'],
    });

    if (!item) {
      return res.status(404).json({
        error: `No se encontró contenido con id "${id}"`,
      });
    }

    if (!item.trailer) {
      return res.json({
        id: item.id,
        titulo: item.titulo,
        mensaje: 'Este contenido no posee trailer disponible.',
      });
    }

    res.json({ id: item.id, titulo: item.titulo, trailer: item.trailer });
  } catch (error) {
    console.error('Error al buscar el trailer:', error);
    res.status(500).json({ error: 'Error al buscar el trailer' });
  }
});

// CRUD de contenido
app.get('/contenido', async (req, res) => {
  try {
    const contenidos = await Contenido.findAll();
    res.json(contenidos);
  } catch (error) {
    console.error('Error al consultar los contenidos:', error);
    res.status(500).json({ error: 'Error al consultar los contenidos' });
  }
});

app.get('/contenido/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo válido' });
    }

    const contenido = await Contenido.findByPk(id);

    if (!contenido) {
      return res.status(404).json({
        error: `No se encontró contenido con id "${id}"`,
      });
    }

    res.json(contenido);
  } catch (error) {
    console.error('Error al buscar el contenido:', error);
    res.status(500).json({ error: 'Error al buscar el contenido' });
  }
});

app.post('/contenido', async (req, res) => {
  try {
    const validationError = validateContenido(req.body, {
      allowAssociations: true,
    });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const {
      titulo,
      categoria,
      sinopsis,
      temporadas,
      trailer,
      generos = [],
      actores = [],
    } = req.body;

    const nuevoContenido = await sequelize.transaction(async (transaction) => {
      await assertAssociationIdsExist(
        Genero,
        'id_genero',
        generos,
        'géneros',
        transaction
      );
      await assertAssociationIdsExist(
        Actor,
        'id_actor',
        actores,
        'actores',
        transaction
      );

      const contenido = await Contenido.create(
        {
          titulo,
          categoria,
          sinopsis,
          temporadas: temporadas ?? null,
          trailer: trailer ?? null,
        },
        { transaction }
      );

      if (generos.length > 0) {
        await ContenidoGenero.bulkCreate(
          generos.map((id) => ({
            id_contenido: contenido.id_contenido,
            id_genero: id,
          })),
          { transaction }
        );
      }

      if (actores.length > 0) {
        await ContenidoActor.bulkCreate(
          actores.map((id) => ({
            id_contenido: contenido.id_contenido,
            id_actor: id,
          })),
          { transaction }
        );
      }

      return contenido;
    });

    res.status(201).json(nuevoContenido);
  } catch (error) {
    if (error instanceof InvalidAssociationIdsError) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error al crear el contenido:', error);
    res.status(500).json({ error: 'Error al crear el contenido' });
  }
});

app.put('/contenido/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo válido' });
    }

    const validationError = validateContenido(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const contenido = await Contenido.findByPk(id);

    if (!contenido) {
      return res.status(404).json({
        error: `No se encontró contenido con id "${id}"`,
      });
    }

    const { titulo, categoria, sinopsis, temporadas, trailer } = req.body;
    await contenido.update({
      titulo,
      categoria,
      sinopsis,
      temporadas: temporadas ?? null,
      trailer: trailer ?? null,
    });
    res.json(contenido);
  } catch (error) {
    console.error('Error al actualizar el contenido:', error);
    res.status(500).json({ error: 'Error al actualizar el contenido' });
  }
});

app.patch('/contenido/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo válido' });
    }

    const validationError = validateContenido(req.body, { partial: true });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (Object.keys(req.body).length !== 1) {
      return res.status(400).json({
        error: 'PATCH debe incluir exactamente un campo para actualizar',
      });
    }

    const contenido = await Contenido.findByPk(id);
    if (!contenido) {
      return res.status(404).json({
        error: `No se encontró contenido con id "${id}"`,
      });
    }

    const categoria =
      req.body.categoria === undefined
        ? contenido.categoria
        : req.body.categoria;
    const temporadas =
      req.body.temporadas === undefined
        ? contenido.temporadas
        : req.body.temporadas;
    const categorySeasonsError = validateTemporadasPorCategoria(
      categoria,
      temporadas
    );
    if (categorySeasonsError) {
      return res.status(400).json({ error: categorySeasonsError });
    }

    await contenido.update(req.body);
    res.json(contenido);
  } catch (error) {
    console.error('Error al modificar parcialmente el contenido:', error);
    res.status(500).json({ error: 'Error al modificar parcialmente el contenido' });
  }
});

app.delete('/contenido/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo válido' });
    }

    const contenido = await Contenido.findByPk(id);

    if (!contenido) {
      return res.status(404).json({
        error: `No se encontró contenido con id "${id}"`,
      });
    }

    await ContenidoGenero.destroy({ where: { id_contenido: id } });
    await ContenidoActor.destroy({ where: { id_contenido: id } });
    await contenido.destroy();

    res.json({ message: 'Contenido eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar el contenido:', error);
    res.status(500).json({ error: 'Error al eliminar el contenido' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const server = app.listen(PORT, async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  await testConnection();
});

process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');

  server.close(async (error) => {
    if (error) {
      console.error('Error al cerrar el servidor HTTP:', error);
      process.exitCode = 1;
    }

    await closeConnection();
  });
});
