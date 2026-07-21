import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly supabaseClient: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey,
  );

  get client(): SupabaseClient {
    return this.supabaseClient;
  }
}
