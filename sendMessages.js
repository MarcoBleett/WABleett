const { Client } = require('whatsapp-web.js'); // Importa el cliente de WhatsApp Web.
const fs = require('fs'); // Manejo del sistema de archivos.
const csv = require('csv-parser'); // Biblioteca para leer archivos CSV.
const createCsvWriter = require('csv-writer').createObjectCsvWriter; // Biblioteca para escribir archivos CSV.

// Inicializa el cliente de WhatsApp con configuraciones específicas.
const client = new Client({
  puppeteer: {
    headless: false, // Configuración para mostrar el navegador durante la ejecución.
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Configuración para evitar errores de permisos en sistemas restringidos.
  }
});

// Configura el escritor de CSV para guardar mensajes y respuestas.
const csvWriter = createCsvWriter({
  path: './messages_responses.csv', // Archivo CSV de salida.
  header: [
    { id: 'sentMessage', title: 'Mensaje Enviado' }, // Columna para el mensaje enviado.
    { id: 'responseMessage', title: 'Respuesta' } // Columna para la respuesta recibida.
  ]
});

let sentMessages = []; // Almacena los mensajes enviados para asociarlos con las respuestas recibidas.

/**
 * Carga un archivo CSV y devuelve un arreglo con las filas.
 * @param {string} filePath - Ruta del archivo CSV a cargar.
 * @returns {Promise<Array>} - Promesa que resuelve con las filas del CSV.
 */
function loadCSV(filePath) {
  return new Promise((resolve, reject) => {
    const messages = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        messages.push(row); // Agrega cada fila del CSV al arreglo.
      })
      .on('end', () => resolve(messages)) // Resuelve la promesa cuando termina de leer.
      .on('error', (err) => reject(err)); // Rechaza la promesa si hay un error.
  });
}

/**
 * Envía un mensaje a un número de WhatsApp.
 * @param {string} phone - Número de teléfono del destinatario (sin espacios ni guiones).
 * @param {string} message - Contenido del mensaje.
 */
async function sendMessage(phone, message) {
  const chatId = `${phone}@c.us`; // Formato del ID de chat en WhatsApp.
  try {
    await client.sendMessage(chatId, message); // Envía el mensaje.
    sentMessages.push({ phone: chatId, message }); // Almacena el mensaje enviado.
  } catch (error) {
    console.error(`Error al enviar mensaje a ${phone}:`, error); // Muestra errores si ocurren.
  }
}

/**
 * Envía mensajes con un retraso configurable entre cada uno.
 * @param {Array} messages - Arreglo de mensajes a enviar.
 * @param {number} delay - Tiempo en milisegundos entre mensajes.
 */
async function sendMessagesWithDelay(messages, delay) {
  for (let i = 0; i < messages.length; i++) {
    const row = messages[i];
    if (row.phone && row.message) {
      await sendMessage(row.phone, row.message); // Envía el mensaje si la fila es válida.
    }
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay)); // Espera el tiempo configurado.
    }
  }
}

// Evento: Captura las respuestas de los usuarios.
client.on('message', async (message) => {
  if (message.body && message.from !== client.info.wid.user) { // Filtra mensajes enviados por el cliente.
    const sentMessage = sentMessages.find(sent => sent.phone === message.from); // Busca el mensaje enviado que corresponde a la respuesta.
    if (sentMessage) {
      try {
        await csvWriter.writeRecords([{
          sentMessage: sentMessage.message,
          responseMessage: message.body
        }]); // Guarda el mensaje enviado y la respuesta en el CSV.
      } catch (error) {
        console.error('Error al guardar la respuesta en CSV:', error); // Maneja errores al guardar.
      }
    }
  }
});

/**
 * Lee el archivo CSV de contactos y envía los mensajes.
 */
async function sendMessagesFromCSV() {
  const filePath = './contacts.csv'; // Ruta del archivo de entrada.
  const delay = 15000; // Retraso entre mensajes (15 segundos).
  try {
    const messages = await loadCSV(filePath); // Carga el archivo CSV.
    await sendMessagesWithDelay(messages, delay); // Envía los mensajes con retraso.
  } catch (error) {
    console.error("Error al procesar el CSV:", error); // Maneja errores al procesar el archivo.
  }
}

// Evento: Indica que el cliente está listo para usar.
client.on('ready', () => {
  sendMessagesFromCSV(); // Comienza a enviar mensajes cuando el cliente está listo.
});

// Evento: Maneja la desconexión del cliente.
client.on('disconnected', () => {
  console.log('Cliente desconectado'); // Mensaje cuando se pierde la conexión.
});

// Inicializa el cliente de WhatsApp.
client.initialize();
