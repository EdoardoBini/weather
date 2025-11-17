import { ConfigService } from '../services/config.service';
import { firstValueFrom } from 'rxjs';

export function appInitializerFactory(configService: ConfigService): () => Promise<any> {
  return () => {
    return firstValueFrom(configService.loadConfig()).catch(error => {
      console.error('Failed to initialize app configuration:', error);
      // Return resolved promise to allow app to continue with fallback config
      return Promise.resolve();
    });
  };
}