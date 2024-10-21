const express = require('express');
const cors = require('cors'); //peticiones dominio
const mysql = require('mysql2');
const multer = require('multer'); //manejo subira de archivos
const path = require('path');

// InicializaExpress
const app = express();
app.use(cors());
app.use(express.json());

// Conexión bd
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'fans',
  database: 'pokedex',
});

// Manejo de la conexión
db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  } else {
    console.log('Connected to the MySQL database.');
  }
});

// Configuración de almacenamiento de imágenes
const storage = multer.diskStorage({
  destination: 'public/imagenes/', // Carpeta para imágenes
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Nombre único
  },
});

const upload = multer({ storage: storage });

// Obtiene todos los Pokémon
app.get('/pokemons', (req, res) => {
  const query = 'SELECT * FROM Pokemon';

  db.query(query, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: 'Database query error' });
    } else {
      res.json(results);
    }
  });
});

// Buscar Pokémon por nombre, número o tipo
app.get('/pokemons/search', (req, res) => {
  const { name = '', number = '', type = '' } = req.query;

  const query = `
    SELECT p.id, p.nombre, p.nroPokedex, p.imagen 
    FROM Pokemon p
    LEFT JOIN Tipo t1 ON p.idTipo1 = t1.id
    LEFT JOIN Tipo t2 ON p.idTipo2 = t2.id
    WHERE 
      (p.nombre LIKE ? OR ? = '')
      AND (p.nroPokedex = ? OR ? = '')
      AND (t1.nombre LIKE ? OR t2.nombre LIKE ? OR ? = '')
    ORDER BY p.nroPokedex;
  `;

  const params = [
    `%${name}%`, name,
    number, number,
    `%${type}%`, `%${type}%`, type,
  ];

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: 'Database query error' });
    } else {
      res.json(results);
    }
  });
});

// Obtiene los detalles de un Pokémon por ID
app.get('/pokemon/:id', (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      p.*, 
      GROUP_CONCAT(DISTINCT t.nombre) AS tipos, 
      GROUP_CONCAT(DISTINCT h.nombre) AS habilidades
    FROM 
      Pokemon p
    LEFT JOIN 
      Tipo t ON t.id IN (p.idTipo1, p.idTipo2)
    LEFT JOIN 
      Habilidad h ON h.id IN (p.idHabilidad1, p.idHabilidad2, p.idHabilidad3)
    WHERE 
      p.id = ?
    GROUP BY 
      p.id;
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: 'Database query error' });
    } else if (results.length === 0) {
      res.status(404).json({ error: 'Pokémon no encontrado' });
    } else {
      res.json(results[0]);
    }
  });
});

// Obtiene la cadena evolutiva del pokemon
app.get('/pokemon/:id/evolutions', (req, res) => {
  const { id } = req.params;

  const query = `
    WITH RECURSIVE PreEvolutions AS (
      SELECT 
        idPokemonBase, idPokemonEvolucion, nivelEvolucion 
      FROM Evolucion 
      WHERE idPokemonEvolucion = ?
      
      UNION ALL
      
      SELECT 
        e.idPokemonBase, e.idPokemonEvolucion, e.nivelEvolucion 
      FROM Evolucion e
      INNER JOIN PreEvolutions pe ON e.idPokemonEvolucion = pe.idPokemonBase
    ),
    PostEvolutions AS (
      SELECT 
        idPokemonBase, idPokemonEvolucion, nivelEvolucion 
      FROM Evolucion 
      WHERE idPokemonBase = ?
      
      UNION ALL
      
      SELECT 
        e.idPokemonBase, e.idPokemonEvolucion, e.nivelEvolucion 
      FROM Evolucion e
      INNER JOIN PostEvolutions pe ON e.idPokemonBase = pe.idPokemonEvolucion
    )
    SELECT 
      p.id, p.nombre, p.nroPokedex, p.imagen, COALESCE(pe.nivelEvolucion, po.nivelEvolucion) AS nivelEvolucion
    FROM Pokemon p
    LEFT JOIN PreEvolutions pe ON p.id = pe.idPokemonBase
    LEFT JOIN PostEvolutions po ON p.id = po.idPokemonEvolucion
    WHERE p.id = ? OR pe.idPokemonBase IS NOT NULL OR po.idPokemonEvolucion IS NOT NULL
    ORDER BY p.nroPokedex;
  `;

  db.query(query, [id, id, id], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      res.status(500).json({ error: 'Database query error' });
    } else {
      res.json(results);
    }
  });
});

//LISTA CRUD POKEMONS
app.get('/pokemons', (req, res) => {
  const query = 'SELECT * FROM Pokemon ORDER BY nroPokedex';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).json({ error: 'Error al listar los Pokémon' });
    } else {
      res.json(results);
    }
  });
});

// Eliminar un Pokémon
app.delete('/pokemons/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM Pokemon WHERE id = ?';
  db.query(query, [id], (err, results) => {
    if (err) {
      res.status(500).json({ error: 'Error al eliminar el Pokémon' });
    } else {
      res.json({ message: 'Pokémon eliminado exitosamente' });
    }
  });
});

// Agrega un nuevo Pokémon
app.post('/pokemons', upload.single('imagen'), (req, res) => {
  const {
    nombre, nroPokedex, idHabilidad1, idHabilidad2, idHabilidad3,
    idTipo1, idTipo2, descripcion, hp, attack, defense, 
    spattack, spdefense, speed, nivelEvolucion,
  } = req.body;

  const imagen = req.file ? req.file.filename : null;

  const query = `
    INSERT INTO Pokemon 
    (nombre, nroPokedex, idHabilidad1, idHabilidad2, idHabilidad3, idTipo1, idTipo2, 
     descripcion, hp, attack, defense, spattack, spdefense, speed, nivelEvolucion, imagen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    nombre, nroPokedex,
    idHabilidad1 || null, idHabilidad2 || null, idHabilidad3 || null, 
    idTipo1 || null, idTipo2 || null,
    descripcion || null, hp || null, attack || null, defense || null,
    spattack || null, spdefense || null, speed || null, nivelEvolucion || null, imagen,
  ];

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error al agregar el Pokémon:', err);
      res.status(500).json({ error: 'Error al agregar el Pokémon' });
    } else {
      res.json({ message: 'Pokémon agregado exitosamente' });
    }
  });
});

// EDITAR POKEMON
app.put('/pokemons/:id', upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const {
    nombre, nroPokedex, idHabilidad1, idHabilidad2, idHabilidad3,
    idTipo1, idTipo2, descripcion, hp, attack, defense, 
    spattack, spdefense, speed, nivelEvolucion,
  } = req.body;

  const imagen = req.file ? req.file.filename : req.body.existingImagen;

  const query = `
    UPDATE Pokemon 
    SET nombre = ?, nroPokedex = ?, idHabilidad1 = ?, idHabilidad2 = ?, idHabilidad3 = ?, 
        idTipo1 = ?, idTipo2 = ?, descripcion = ?, hp = ?, attack = ?, defense = ?, 
        spattack = ?, spdefense = ?, speed = ?, nivelEvolucion = ?, imagen = ? 
    WHERE id = ?
  `;

  const params = [
    nombre, nroPokedex,
    idHabilidad1 || null, idHabilidad2 || null, idHabilidad3 || null,
    idTipo1 || null, idTipo2 || null,
    descripcion || null, hp || null, attack || null, defense || null,
    spattack || null, spdefense || null, speed || null, nivelEvolucion || null, imagen, id,
  ];

  db.query(query, params, (err) => {
    if (err) {
      console.error('Error al editar el Pokémon:', err);
      res.status(500).json({ error: 'Error al editar el Pokémon' });
    } else {
      res.json({ message: 'Pokémon editado exitosamente' });
    }
  });
});

// Lista todas las habilidades
app.get('/habilidades', (req, res) => {
  const query = 'SELECT id, nombre FROM Habilidad';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error al obtener habilidades:', err);
      res.status(500).json({ error: 'Error al obtener habilidades' });
    } else {
      res.json(results);
    }
  });
});

// Lista todos los tipos
app.get('/tipos', (req, res) => {
  const query = 'SELECT id, nombre FROM Tipo';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error al obtener tipos:', err);
      res.status(500).json({ error: 'Error al obtener tipos' });
    } else {
      res.json(results);
    }
  });
});

// Puerto del servidor
const port = 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
