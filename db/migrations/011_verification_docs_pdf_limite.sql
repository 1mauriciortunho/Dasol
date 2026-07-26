-- 011 · verification-docs: permitir PDF y limitar tamaño por archivo
-- La app ahora deja adjuntar PDFs como documento de verificación. Este bloque
-- refuerza del lado del servidor lo que la app valida en el cliente: tope de
-- 5 MB por archivo y solo los tipos esperados (imágenes y PDF). Cualquier
-- subida que no cumpla es rechazada por Storage aunque alguien saltee la app.

update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB en bytes
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
where id = 'verification-docs';
