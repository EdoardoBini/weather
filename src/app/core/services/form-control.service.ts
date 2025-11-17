import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FormControlService {
  private clearFormSubject = new Subject<void>();
  
  clearForm$ = this.clearFormSubject.asObservable();
  
  clearForm(): void {
    this.clearFormSubject.next();
  }
}