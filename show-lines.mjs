import { readFileSync } from 'fs';
const lines = readFileSync('client/src/pages/settings.tsx', 'utf8').split('\n');
// Search for "Danger Zone" or "deleteStep" or "Fresh Start"
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Danger Zone') || lines[i].includes('deleteStep') || lines[i].includes('Fresh Start') || lines[i].includes('Delete Account') || lines[i].includes('Trash2')) {
    console.log(`${i+1}: ${lines[i]}`);
  }
}
