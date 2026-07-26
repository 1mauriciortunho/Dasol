import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { getSupabase } from './supabase';

// Id corto para nombrar archivos sin chocar (no necesita ser un UUID formal:
// los paths se organizan por carpeta de campaña, así que con esto alcanza).
export function shortId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

type UploadParams = {
  bucket: string;
  path: string;
  uri: string;
  contentType?: string;
};

// Sube un archivo local (uri del picker: imagen o PDF) a un bucket de
// Supabase Storage.
// El cuerpo se arma distinto según la plataforma:
//   - Nativo: no hay Blob/File, leemos el archivo en base64 y lo pasamos a
//     ArrayBuffer (vía expo-file-system, que no existe en web).
//   - Web: el picker devuelve un blob:/data: URL; lo leemos con fetch -> Blob.
// Devuelve el path subido.
export async function uploadImage({
  bucket,
  path,
  uri,
  contentType = 'image/jpeg',
}: UploadParams): Promise<string> {
  let body: ArrayBuffer | Blob;

  if (Platform.OS === 'web') {
    try {
      const res = await fetch(uri);
      body = await res.blob();
    } catch {
      throw new Error('No pudimos leer el archivo.');
    }
  } else {
    let base64: string;
    try {
      base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      throw new Error('No pudimos leer el archivo del dispositivo.');
    }
    body = decode(base64);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: false });

  if (error) throw new Error(`No pudimos subir el archivo: ${error.message}`);
  return data.path;
}

// Para buckets públicos: URL accesible directamente (no aplica a buckets
// privados como verification-docs o payment-receipts).
export function getPublicUrl(bucket: string, path: string): string {
  const supabase = getSupabase();
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
