import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterDIDPage from './pages/RegisterDIDPage';
import RegisterAppPage from './pages/RegisterAppPage';
import SeekerHomePage from './pages/SeekerHomePage';
import SeekerJobListPage from './pages/SeekerJobListPage';
import SeekerMatchResultPage from './pages/SeekerMatchResultPage';
import SeekerInterviewInvitationsPage from './pages/SeekerInterviewInvitationsPage';
import SeekerInterviewResultsPage from './pages/SeekerInterviewResultsPage';
import SeekerEditRequestPage from './pages/SeekerEditRequestPage';
import SeekerEditResumePage from './pages/SeekerEditResumePage';
import SeekerEditProfile from './pages/SeekerEditProfile';
import CompanyHomePage from './pages/CompanyHomePage';
import CompanyPostJobPage from './pages/CompanyPostJobPage';
import CompanyMatchResultPage from './pages/CompanyMatchResultPage';
import CompanyMangageJobs from './pages/CompanyManageJobs';
import CompanyEditJob from './pages/CompanyEditJob';
import CompanyLookUpResume from './pages/CompanyLookUpResume';
import CompanySeekerList from './pages/CompanySeekerListPage';
import CompanyLookUpInvitations from './pages/CompanyLookUpInvitation';
import CompanyLookUpInvitationDetail from './pages/CompanyLookUpInvitationDetail';
import CompanyManageInterview from './pages/CompanyMangeInterview';
import CompanyViewJobApply from './pages/CompanyLookUpJobApply';
import GovernmentHomePage from './pages/GovernmentHomePage';
import GovernmentManageArbitration from './pages/GovernmentManageArbitration';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register-DID" element={<RegisterDIDPage />} />
      <Route path="/register-app" element={<RegisterAppPage />} />
      <Route path="/seeker/home" element={<SeekerHomePage />} />
      <Route path="/seeker/job-list" element={<SeekerJobListPage />} />
      <Route path="/seeker/match-result" element={<SeekerMatchResultPage />} />
      <Route path="/seeker/interview-invitations" element={<SeekerInterviewInvitationsPage />} />
      <Route path="/seeker/interview-results" element={<SeekerInterviewResultsPage />} />
      <Route path="/seeker/edit-request" element={<SeekerEditRequestPage />} />
      <Route path="/seeker/edit-resume" element={<SeekerEditResumePage />} />
      <Route path="/seeker/edit-profile" element={<SeekerEditProfile />} />
      <Route path="/company/home" element={<CompanyHomePage />} />
      <Route path="/company/post-job" element={<CompanyPostJobPage />} />
      <Route path="/company/match-result" element={<CompanyMatchResultPage />} />
      <Route path="/company/manage-jobs" element={<CompanyMangageJobs />} />
      <Route path="/company/edit-job/:jobId" element={<CompanyEditJob />} />
      <Route path="/company/resume/:address" element={<CompanyLookUpResume />} />
      <Route path="/company/seeker-list" element={<CompanySeekerList />} />
      <Route path="/company/invitations" element={<CompanyLookUpInvitations />} />
      <Route path="/company/invitation-detail" element={<CompanyLookUpInvitationDetail />} />
      <Route path="/company/manage-interview" element={<CompanyManageInterview />} />
      <Route path="/company/job-apply/:jobId" element={<CompanyViewJobApply />} />
      <Route path="/government/home" element={<GovernmentHomePage />} />
      <Route path="/government/manage-arbitration" element={<GovernmentManageArbitration />} />
    </Routes>
  );
}

export default App;