import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { ScoreEditorComponent } from './app/features/score-editor/score-editor.component';

bootstrapApplication(ScoreEditorComponent, appConfig)
  .catch((err) => console.error(err));
