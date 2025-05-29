import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged, signOut } from '@angular/fire/auth';
import { Firestore, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { LogoutConfirmationComponent } from '../../components/logout-confirmation/logout-confirmation.component';
import { StatusConfirmationDialogComponent } from './components/status-confirmation-dialog/status-confirmation-dialog.component';

interface Report {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;
  userId: string;
  userEmail: string;
  location: string;
  address: string;
  images: string[];
  upvotes?: number;
  isUpvoted?: boolean;
  timestamp?: any;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LogoutConfirmationComponent,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    StatusConfirmationDialogComponent
  ],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css']
})
export class ReportsComponent implements OnInit, OnDestroy {
  reports: Report[] = [];
  isSortMenuOpen = false;
  currentSort = 'votes-high';
  showLogoutDialog = false;
  isSubmitting = false;
  defaultAvatarPath = 'assets/profile.png';
  isAdmin = false;
  showAdminSetup = false;
  showStatusConfirmationDialog = false;
  reportToUpdate: Report | null = null;
  newStatusToConfirm: 'pending' | 'in_progress' | 'resolved' | null = null;
  statusOptions: ('pending' | 'in_progress' | 'resolved')[] = ['pending', 'in_progress', 'resolved'];
  private unsubscribe: (() => void) | null = null;
  private authUnsubscribe: (() => void) | null = null;
  console = console;

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.authUnsubscribe = onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        localStorage.setItem('authToken', user.uid);
        await this.checkUserRole(user.uid);
        this.loadReports();
      } else {
        localStorage.removeItem('authToken');
        this.router.navigate(['/sign-in']);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }
  }

  private loadReports(): void {
    console.log('Setting up Firestore subscription...');
    const reportsRef = collection(this.firestore, 'reports');
    const q = query(reportsRef, orderBy('timestamp', 'desc'));
    
    this.unsubscribe = onSnapshot(q, async (snapshot) => {
      console.log('=== Reports Loading Debug ===');
      console.log('1. Received snapshot from Firestore:', snapshot.size, 'documents');
      
      const user = this.auth.currentUser;

      // Use Promise.all with map to process each document asynchronously
      const newReports = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        console.log('2. Processing document:', docSnapshot.id);
        console.log('3. Document data:', data);
        
        // Skip resolved reports for everyone in the reports dashboard
        if (data['status'] === 'resolved') {
          return null;
        }
        
        // Handle images array and imageUrl
        const images = data['images'] || [];
        const imageUrl = data['imageUrl'] || (images.length > 0 ? images[0] : null);
        console.log('4. Image URL from Firestore:', imageUrl);
        
        // Handle location and address
        const location = data['location'] || data['address'] || '';
        const address = data['address'] || data['location'] || '';
        
        // Check if current user has upvoted this report
        let isUpvoted = false;
        if (user) {
          // Construct the document reference for the user's upvote in the subcollection
          const userUpvoteRef = doc(this.firestore, 'reports', docSnapshot.id, 'upvotes', user.uid);
          try {
             const upvoteDoc = await getDoc(userUpvoteRef);
             isUpvoted = upvoteDoc.exists();
             console.log(`User ${user.uid} upvoted report ${docSnapshot.id}: ${isUpvoted}`);
          } catch (error) {
             console.error(`Error checking upvote status for report ${docSnapshot.id}:`, error);
             // Assume not upvoted if there's an error checking
             isUpvoted = false;
          }
        }

        const report = { // Mapping to report object
          id: docSnapshot.id,
          title: data['title'],
          description: data['description'],
          category: data['category'],
          status: data['status'],
          createdAt: data['createdAt'],
          userId: data['userId'],
          userEmail: data['userEmail'],
          location: location,
          address: address,
          images: images,
          upvotes: data['upvotes'] || 0,
          isUpvoted: isUpvoted, // Set isUpvoted based on the check
          timestamp: data['timestamp'] || data['createdAt'],
          imageUrl: imageUrl,
          latitude: data['latitude'],
          longitude: data['longitude']
        } as Report;
        
        console.log('5. Processed report:', report);
        return report;
      }));
      
      // Filter out null values (resolved reports)
      this.reports = newReports.filter(report => report !== null) as Report[];
      console.log('6. New reports array:', this.reports);
      this.applyCurrentSort();
      this.cdr.detectChanges();
    }, (error) => {
      console.error('Error fetching reports:', error);
    });
  }

  isUserLoggedIn(): boolean {
    return !!this.auth.currentUser;
  }

  toggleSortMenu(): void {
    this.isSortMenuOpen = !this.isSortMenuOpen;
  }

  sortReports(sortType: string, event?: Event): void {
    if (event) {
      event.preventDefault();
    }

    this.currentSort = sortType;
    this.isSortMenuOpen = false;
    this.applyCurrentSort();
  }

  private applyCurrentSort(): void {
    if (!this.reports.length) return;

    this.reports.sort((a, b) => {
      if (this.currentSort === 'votes-high') {
        return (b.upvotes || 0) - (a.upvotes || 0);
      } else if (this.currentSort === 'votes-low') {
        return (a.upvotes || 0) - (b.upvotes || 0);
      } else if (this.currentSort === 'latest') {
        // Sort by timestamp descending (latest first)
        return (b.timestamp?.toDate?.() ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime()) -
               (a.timestamp?.toDate?.() ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime());
      } else if (this.currentSort === 'oldest') {
        // Sort by timestamp ascending (oldest first)
        return (a.timestamp?.toDate?.() ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime()) -
               (b.timestamp?.toDate?.() ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime());
      } else {
        // Default to votes-high
        return (b.upvotes || 0) - (a.upvotes || 0);
      }
    });
  }

  async upvoteReport(report: Report): Promise<void> {
    if (this.isSubmitting) return;
    
    try {
      this.isSubmitting = true;
      
      // Get the current user
      const user = this.auth.currentUser;
      if (!user) {
        this.snackBar.open('Please log in to upvote reports', 'Close', { duration: 3000 });
        this.isSubmitting = false; // Ensure isSubmitting is reset
        return;
      }

      const reportRef = doc(this.firestore, 'reports', report.id);
      const userUpvoteRef = doc(this.firestore, 'reports', report.id, 'upvotes', user.uid);

      // Check if user has already upvoted
      const upvoteDoc = await getDoc(userUpvoteRef);
      
      if (upvoteDoc.exists()) {
        // Remove upvote
        await deleteDoc(userUpvoteRef);
        await updateDoc(reportRef, {
          upvotes: increment(-1)
        });
        
        // Update local state immediately
        report.upvotes = (report.upvotes || 0) - 1;
        report.isUpvoted = false;
        this.cdr.detectChanges(); // Trigger change detection

        this.snackBar.open('Upvote removed', 'Close', { duration: 2000 });
      } else {
        // Add upvote
        await setDoc(userUpvoteRef, {
          userId: user.uid,
          timestamp: serverTimestamp()
        });
        await updateDoc(reportRef, {
          upvotes: increment(1)
        });

        // Update local state immediately
        report.upvotes = (report.upvotes || 0) + 1;
        report.isUpvoted = true;
        this.cdr.detectChanges(); // Trigger change detection

        this.snackBar.open('Report upvoted!', 'Close', { duration: 2000 });
      }

    } catch (error) {
      console.error('Error upvoting report:', error);
      this.snackBar.open('Error upvoting report', 'Close', { duration: 3000 });
    } finally {
      this.isSubmitting = false;
    }
  }

  getUpvoteIcon(report: Report): string {
    return report.isUpvoted ? 'assets/upvote-select.png' : 'assets/upvote.png';
  }

  getAvatarPath(avatar: string | null): string {
    return avatar || this.defaultAvatarPath;
  }

  reportIssue(): void {
    this.router.navigate(['/report-an-issue']);
  }

  handleLogout(): void {
    this.showLogoutDialog = true;
  }

  onLogoutConfirmed(): void {
    signOut(this.auth).then(() => {
      localStorage.removeItem('authToken');
      this.router.navigate(['/sign-in']);
    }).catch((error) => {
      console.error('Error signing out:', error);
    });
  }

  onLogoutCancelled(): void {
    this.showLogoutDialog = false;
  }

  handleImageError(event: any) {
    console.error('=== Image Error Debug ===');
    console.error('1. Image load error:', event);
    console.error('2. Failed image URL:', event.target.src);
    
    // Try to load the image with HTTPS if it failed with HTTP
    const failedUrl = event.target.src;
    if (failedUrl.startsWith('http:')) {
      const httpsUrl = failedUrl.replace('http:', 'https:');
      console.log('3. Attempting to load with HTTPS:', httpsUrl);
      event.target.src = httpsUrl;
      return;
    }
    
    // If HTTPS also fails or if it was already HTTPS, show the placeholder
    event.target.style.display = 'none';
    const parent = event.target.parentElement;
    if (parent) {
      const placeholder = document.createElement('div');
      placeholder.className = 'no-image-placeholder';
      placeholder.innerHTML = `
        <i class="fas fa-image"></i>
        <span>Image not available</span>
        <small>URL: ${failedUrl}</small>
      `;
      parent.appendChild(placeholder);
    }
  }

  handleImageLoad(imageUrl: string) {
    console.log('Image loaded successfully:', imageUrl);
  }

  handleStatusChange(report: Report, newStatus: 'pending' | 'in_progress' | 'resolved'): void {
    if (!this.isAdmin) {
      this.snackBar.open('Only administrators can update report status', 'Close', { duration: 3000 });
      return;
    }

    // Prevent the status from changing immediately
    const selectElement = event?.target as HTMLSelectElement;
    if (selectElement) {
      selectElement.value = report.status;
    }

    // Store the report and new status for confirmation
    this.reportToUpdate = report;
    this.newStatusToConfirm = newStatus;
    this.showStatusConfirmationDialog = true;
  }

  async onStatusChangeConfirmed(): Promise<void> {
    if (!this.reportToUpdate || !this.newStatusToConfirm) {
      this.onStatusChangeCancelled();
      return;
    }

    try {
      const reportRef = doc(this.firestore, 'reports', this.reportToUpdate.id);
      
      // Update the status
      await updateDoc(reportRef, {
        status: this.newStatusToConfirm
      });

      // If the status is resolved, immediately remove it from the user's view
      if (this.newStatusToConfirm === 'resolved') {
        const index = this.reports.findIndex(r => r.id === this.reportToUpdate?.id);
        if (index !== -1) {
          this.reports.splice(index, 1);
          this.cdr.detectChanges();
        }
      } else {
        // For other status updates, just update the status
        const index = this.reports.findIndex(r => r.id === this.reportToUpdate?.id);
        if (index !== -1 && this.reportToUpdate) {
          this.reports[index].status = this.newStatusToConfirm;
          this.cdr.detectChanges();
        }
      }

      this.snackBar.open('Report status updated successfully', 'Close', { duration: 2000 });

    } catch (error) {
      console.error('Error updating report status:', error);
      this.snackBar.open('Error updating report status', 'Close', { duration: 3000 });
    } finally {
      this.onStatusChangeCancelled();
    }
  }

  onStatusChangeCancelled(): void {
    this.showStatusConfirmationDialog = false;
    this.reportToUpdate = null;
    this.newStatusToConfirm = null;
  }

  // Function to create an admin user
  async createAdminUser(userId: string): Promise<void> {
    try {
      const adminRef = doc(this.firestore, 'admins', userId);
      await setDoc(adminRef, {
        role: 'admin',
        addedAt: serverTimestamp(),
        email: this.auth.currentUser?.email || 'unknown'
      });
      
      this.snackBar.open('Admin user created successfully', 'Close', { duration: 2000 });
      this.isAdmin = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error creating admin user:', error);
      this.snackBar.open('Error creating admin user', 'Close', { duration: 3000 });
    }
  }

  // Function to check if current user is admin
  async checkIfCurrentUserIsAdmin(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;

    try {
      const adminDoc = await getDoc(doc(this.firestore, 'admins', user.uid));
      return adminDoc.exists();
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  private async checkAdminStatus(userId: string): Promise<void> {
    try {
      const adminDoc = await getDoc(doc(this.firestore, 'admins', userId));
      this.isAdmin = adminDoc.exists();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error checking admin status:', error);
      this.isAdmin = false;
    }
  }

  private async checkInitialAdminSetup(): Promise<void> {
    try {
      // Check if there are any admins in the collection
      const adminsRef = collection(this.firestore, 'admins');
      const adminsSnapshot = await getDocs(adminsRef);
      
      if (adminsSnapshot.empty) {
        // No admins exist, show the setup button
        this.showAdminSetup = true;
      } else {
        // Admins exist, check if current user is admin
        await this.checkAdminStatus(this.auth.currentUser?.uid || '');
      }
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error checking initial admin setup:', error);
      this.showAdminSetup = false;
    }
  }

  async setupInitialAdmin(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      this.snackBar.open('You must be logged in to setup admin', 'Close', { duration: 3000 });
      return;
    }

    try {
      await this.createAdminUser(user.uid);
      this.showAdminSetup = false;
      this.snackBar.open('Initial admin setup complete', 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Error setting up initial admin:', error);
      this.snackBar.open('Error setting up admin', 'Close', { duration: 3000 });
    }
  }

  private async checkUserRole(userId: string): Promise<void> {
    try {
      const userDoc = await getDoc(doc(this.firestore, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        this.isAdmin = userData['role'] === 'admin';
        localStorage.setItem('userRole', userData['role']);
        console.log('User role set to:', userData['role']);
        
        // Check if this is the first admin setup
        if (this.isAdmin) {
          await this.checkInitialAdminSetup();
        }
      } else {
        this.isAdmin = false;
        localStorage.setItem('userRole', 'user');
        console.log('User document not found, defaulting to user role');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      this.isAdmin = false;
      localStorage.setItem('userRole', 'user');
    }
    this.cdr.detectChanges();
  }

  private mapReportData(doc: any): Report {
    const data = doc.data();
    return {
      id: doc.id,
      title: data['title'],
      description: data['description'],
      category: data['category'],
      status: data['status'],
      createdAt: data['createdAt'],
      userId: data['userId'],
      userEmail: data['userEmail'],
      location: data['location'] || data['address'] || '',
      address: data['address'] || data['location'] || '',
      images: data['images'] || [],
      upvotes: data['upvotes'] || 0,
      isUpvoted: data['isUpvoted'] || false,
      timestamp: data['createdAt'],
      imageUrl: data['imageUrl'] || (data['images'] && data['images'][0]) || null,
      latitude: data['latitude'],
      longitude: data['longitude']
    };
  }
}
