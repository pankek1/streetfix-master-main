import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportAnIssueComponent } from './report-an-issue.component';

describe('ReportAnIssueComponent', () => {
  let component: ReportAnIssueComponent;
  let fixture: ComponentFixture<ReportAnIssueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportAnIssueComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReportAnIssueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
