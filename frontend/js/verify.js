// Verification Page JavaScript
// Handles multi-step form navigation, validation, and API interactions

class VerificationForm {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 5;
    this.trustScore = 0;
    this.formData = {};
    this.token = null;
    this.userId = null;
    this.phoneNumber = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateStepDisplay();
    this.loadStoredData();
  }

  setupEventListeners() {
    // Step 1: Phone Form
    const phoneForm = document.getElementById('phoneForm');
    if (phoneForm) {
      phoneForm.addEventListener('submit', (e) => this.handlePhoneSendOTP(e));
    }

    // OTP Form
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
      otpForm.addEventListener('submit', (e) => this.handleOTPVerify(e));
      
      const otpInputs = document.querySelectorAll('.otp-digit');
      otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
          if (e.target.value.length === 1 && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
            otpInputs[index - 1].focus();
          }
        });
      });
    }

    // Resend OTP
    const resendBtn = document.getElementById('resendOtpBtn');
    if (resendBtn) {
      resendBtn.addEventListener('click', () => this.handlePhoneSendOTP(null, true));
    }

    // Step 2: Personal Details
    const personalDetailsForm = document.getElementById('personalDetailsForm');
    if (personalDetailsForm) {
      personalDetailsForm.addEventListener('submit', (e) => this.handlePersonalDetailsSubmit(e));
    }

    // Upload boxes
    document.querySelectorAll('.upload-box').forEach(box => {
      box.addEventListener('click', () => {
        box.querySelector('input[type="file"]').click();
      });

      const fileInput = box.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e, box));
      }
    });

    // Step 3: Guarantor Form
    const guarantorForm = document.getElementById('guarantorForm');
    if (guarantorForm) {
      guarantorForm.addEventListener('submit', (e) => this.handleGuarantorSubmit(e));

      const guarantorNameInput = document.getElementById('guarantorName');
      if (guarantorNameInput) {
        guarantorNameInput.addEventListener('input', () => this.updateGuarantorPreview());
      }

      const relationshipSelect = document.getElementById('relationship');
      if (relationshipSelect) {
        relationshipSelect.addEventListener('change', () => this.updateGuarantorPreview());
      }
    }

    // Step 4: Deposit Form
    const depositForm = document.getElementById('depositForm');
    if (depositForm) {
      depositForm.addEventListener('submit', (e) => this.handleDepositSubmit(e));
    }

    // Step 5: Agreement Form
    const agreementForm = document.getElementById('agreementForm');
    if (agreementForm) {
      agreementForm.addEventListener('submit', (e) => this.handleAgreementSubmit(e));
    }

    // Collapsible Card
    const collapsibleHeader = document.querySelector('.collapsible-header');
    if (collapsibleHeader) {
      collapsibleHeader.addEventListener('click', () => {
        const card = collapsibleHeader.closest('.collapsible-card');
        card.classList.toggle('open');
        const content = card.querySelector('.collapsible-content');
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Step Navigation
    document.querySelectorAll('.step-navigation').forEach((nav, index) => {
      const backBtn = nav.querySelector('.btn-ghost');
      const nextBtn = nav.querySelectorAll('.btn')[1];

      if (backBtn && index > 0) {
        backBtn.addEventListener('click', () => this.goStep(this.currentStep - 1));
        backBtn.disabled = false;
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => this.goStep(this.currentStep + 1));
      }
    });
  }

  // Step Navigation
  goStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > this.totalSteps) return;

    const steps = document.querySelectorAll('.step');
    steps.forEach(step => step.style.display = 'none');

    const targetStep = document.querySelector(`.step[data-step="${stepNumber}"]`);
    if (targetStep) {
      targetStep.style.display = 'block';
    }

    this.currentStep = stepNumber;
    this.updateStepDisplay();

    if (stepNumber === 4) {
      this.populateDepositPhone();
    }

    if (stepNumber === 5) {
      this.loadGuarantorChangeInfo();
    }

    window.scrollTo(0, 0);
  }

  updateStepDisplay() {
    document.querySelectorAll('.step-item').forEach((item, index) => {
      const stepNum = index + 1;
      item.classList.remove('active', 'completed');

      if (stepNum < this.currentStep) {
        item.classList.add('completed');
      } else if (stepNum === this.currentStep) {
        item.classList.add('active');
      }
    });
  }

  // Trust Score Management
  updateTrustScore(points) {
    this.trustScore += points;
    this.trustScore = Math.min(this.trustScore, 100);

    const fill = document.getElementById('trustScoreFill');
    const value = document.getElementById('trustScoreValue');

    if (fill) {
      fill.style.width = `${this.trustScore}%`;
    }
    if (value) {
      value.textContent = this.trustScore;
    }

    this.updateTrustScoreColor();
  }

  updateTrustScoreColor() {
    const fill = document.getElementById('trustScoreFill');
    if (!fill) return;

    if (this.trustScore < 40) {
      fill.style.background = 'linear-gradient(90deg, #E24B4A 0%, #E24B4A 100%)';
    } else if (this.trustScore < 60) {
      fill.style.background = 'linear-gradient(90deg, #E24B4A 0%, #EF9F27 100%)';
    } else if (this.trustScore < 80) {
      fill.style.background = 'linear-gradient(90deg, #EF9F27 0%, #534AB7 100%)';
    } else {
      fill.style.background = 'linear-gradient(90deg, #534AB7 0%, #1D9E75 100%)';
    }
  }

  // Step 1: Phone Verification
  async handlePhoneSendOTP(e, isResend = false) {
    if (e) e.preventDefault();

    const operator = document.getElementById('operator').value;
    const phone = document.getElementById('phone').value.replace(/\s/g, '');

    if (!operator || !phone) {
      this.showError('Please fill in all fields');
      return;
    }

    if (!/^6\d{8}$/.test(phone)) {
      this.showError('Invalid phone format');
      return;
    }

    this.phoneNumber = phone;

    try {
      const btn = document.getElementById('sendOtpBtn');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const response = await fetch('/api/verification/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, operator })
      });

      const data = await response.json();

      if (response.ok) {
        document.getElementById('phoneForm').style.display = 'none';
        document.getElementById('otpSection').style.display = 'block';
        this.showSuccess('OTP sent to your phone');
      } else {
        this.showError(data.error || 'Failed to send OTP');
      }

      btn.disabled = false;
      btn.textContent = isResend ? 'Resend OTP' : 'Send OTP';
    } catch (error) {
      console.error('Error sending OTP:', error);
      this.showError('Failed to send OTP. Please try again.');
      document.getElementById('sendOtpBtn').disabled = false;
    }
  }

  async handleOTPVerify(e) {
    e.preventDefault();

    const otpInputs = document.querySelectorAll('.otp-digit');
    const code = Array.from(otpInputs).map(input => input.value).join('');

    if (code.length !== 6) {
      this.showError('Please enter all 6 digits');
      return;
    }

    try {
      const btn = document.getElementById('verifyOtpBtn');
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      const response = await fetch('/api/verification/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: this.phoneNumber, code })
      });

      const data = await response.json();

      if (response.ok) {
        this.token = data.token;
        this.userId = data.userId;
        localStorage.setItem('verificationToken', this.token);
        localStorage.setItem('userId', this.userId);

        this.updateTrustScore(20);
        this.showSuccess('Phone verified!');

        setTimeout(() => {
          this.goStep(2);
        }, 1000);
      } else {
        this.showError(data.error || 'Invalid OTP');
      }

      btn.disabled = false;
      btn.textContent = 'Verify Phone';
    } catch (error) {
      console.error('Error verifying OTP:', error);
      this.showError('Failed to verify OTP');
      document.getElementById('verifyOtpBtn').disabled = false;
    }
  }

  // Step 2: Personal Details
  async handlePersonalDetailsSubmit(e) {
    e.preventDefault();

    const fullName = document.getElementById('fullName').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value;
    const gender = document.getElementById('gender').value;
    const cniNumber = document.getElementById('cniNumber').value;
    const region = document.getElementById('region').value;

    if (!fullName || !dateOfBirth || !gender || !cniNumber || !region) {
      this.showError('Please fill in all fields');
      return;
    }

    const dobDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();
    
    // Adjust age if birthday hasn't occurred this year
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
      age--;
    }

    if (age < 18) {
      this.showError('You must be at least 18 years old');
      return;
    }

    this.formData = { fullName, dateOfBirth, gender, cniNumber, region };

    try {
      const btn = document.querySelector('.step[data-step="2"] .btn-primary');
      btn.disabled = true;

      // Upload documents
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const formDataUpload = new FormData();

      for (let input of fileInputs) {
        if (input.files[0]) {
          formDataUpload.append(input.name, input.files[0]);
        }
      }

      const uploadResponse = await fetch('/api/verification/upload-documents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formDataUpload
      });

      if (!uploadResponse.ok) {
        const uploadData = await uploadResponse.json();
        this.showError(uploadData.error || 'Failed to upload documents');
        btn.disabled = false;
        return;
      }

      this.updateTrustScore(20);
      this.showSuccess('Personal details and documents saved!');

      setTimeout(() => {
        this.goStep(3);
      }, 1000);
    } catch (error) {
      console.error('Error:', error);
      this.showError('Failed to save details');
      document.querySelector('.step[data-step="2"] .btn-primary').disabled = false;
    }
  }

  handleFileUpload(e, uploadBox) {
    const file = e.target.files[0];

    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.showError('Only JPG and PNG files are allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.showError('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const preview = uploadBox.querySelector('.upload-preview');
      preview.innerHTML = `<img src="${evt.target.result}" alt="Preview">`;
      preview.style.display = 'block';
      uploadBox.querySelector('.upload-content').style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  // Step 3: Guarantor
  updateGuarantorPreview() {
    const name = document.getElementById('guarantorName').value;
    const relationship = document.getElementById('relationship').value;

    if (name) {
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      document.getElementById('avatarInitials').textContent = initials;
      document.getElementById('previewName').textContent = name;
      document.getElementById('previewRelation').textContent = relationship || '-';

      const card = document.querySelector('.guarantor-preview-card');
      if (card) {
        card.style.display = 'flex';
      }
    }
  }

  async handleGuarantorSubmit(e) {
    e.preventDefault();

    const guarantorName = document.getElementById('guarantorName').value;
    const relationship = document.getElementById('relationship').value;
    const age = parseInt(document.getElementById('guarantorAge').value);
    const guarantorPhone = document.getElementById('guarantorPhone').value;
    const guarantorCNI = document.getElementById('guarantorCNI').value;
    const town = document.getElementById('guarantorTown').value;
    const reason = document.getElementById('guarantorReason').value;

    if (age < 25) {
      this.showError('Guarantor must be at least 25 years old');
      return;
    }

    if (reason.length < 30) {
      this.showError('Reason must be at least 30 characters');
      return;
    }

    if (!document.getElementById('guarantorInformed').checked || !document.getElementById('guarantorAccurate').checked) {
      this.showError('Please confirm both statements');
      return;
    }

    try {
      const btn = document.querySelector('.step[data-step="3"] form').querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const response = await fetch('/api/guarantor/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          guarantorName,
          relationship,
          age,
          guarantorPhone,
          guarantorCNI,
          town,
          reason
        })
      });

      const data = await response.json();

      if (response.ok) {
        this.updateTrustScore(20);
        this.showSuccess('Guarantor request sent! Awaiting confirmation...');
        localStorage.setItem('guarantorStatus', 'pending');

        setTimeout(() => {
          this.goStep(4);
        }, 1500);
      } else {
        this.showError(data.error || 'Failed to send guarantor request');
      }

      btn.disabled = false;
      btn.textContent = 'Send Confirmation Request';
    } catch (error) {
      console.error('Error:', error);
      this.showError('Failed to send guarantor request');
      document.querySelector('.step[data-step="3"] form').querySelector('button[type="submit"]').disabled = false;
    }
  }

  // Step 4: Deposit
  populateDepositPhone() {
    if (this.phoneNumber) {
      document.getElementById('depositPhone').value = this.phoneNumber.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    }
  }

  async handleDepositSubmit(e) {
    e.preventDefault();

    try {
      const btn = document.getElementById('payDepositBtn');
      btn.disabled = true;

      const response = await fetch('/api/deposit/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          phoneNumber: this.phoneNumber,
          operator: 'MTN'
        })
      });

      const data = await response.json();

      if (response.ok) {
        document.getElementById('depositForm').style.display = 'none';
        document.getElementById('paymentProcessing').style.display = 'block';

        this.pollDepositStatus(data.referenceId);
      } else {
        this.showError(data.error || 'Failed to initiate payment');
        btn.disabled = false;
      }
    } catch (error) {
      console.error('Error:', error);
      this.showError('Failed to initiate payment');
      document.getElementById('payDepositBtn').disabled = false;
    }
  }

  pollDepositStatus(referenceId) {
    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      attempts++;
      document.getElementById('attempts').textContent = attempts;

      try {
        const response = await fetch(`/api/deposit/status/${referenceId}`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });

        const data = await response.json();

        if (data.status === 'successful') {
          document.getElementById('paymentProcessing').style.display = 'none';

          const resultDiv = document.getElementById('paymentResult');
          resultDiv.className = 'payment-result success';
          resultDiv.innerHTML = `
            <div style="text-align: center;">
              <i class="ti ti-check" style="font-size: 2rem;"></i>
              <p style="margin-top: 0.5rem;">Deposit payment successful!</p>
            </div>
          `;
          resultDiv.style.display = 'block';

          this.updateTrustScore(20);

          setTimeout(() => {
            this.goStep(5);
          }, 1500);
        } else if (data.status === 'failed') {
          document.getElementById('paymentProcessing').style.display = 'none';

          const resultDiv = document.getElementById('paymentResult');
          resultDiv.className = 'payment-result error';
          resultDiv.innerHTML = `
            <div style="text-align: center;">
              <i class="ti ti-x" style="font-size: 2rem;"></i>
              <p>Payment failed. Please try again.</p>
              <button type="button" class="btn btn-primary" onclick="location.reload()">Retry</button>
            </div>
          `;
          resultDiv.style.display = 'block';
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          document.getElementById('paymentProcessing').style.display = 'none';

          const resultDiv = document.getElementById('paymentResult');
          resultDiv.className = 'payment-result error';
          resultDiv.innerHTML = `
            <div style="text-align: center;">
              <i class="ti ti-alert-circle" style="font-size: 2rem;"></i>
              <p>Payment timeout. Please check your phone or try again.</p>
              <button type="button" class="btn btn-primary" onclick="location.reload()">Retry</button>
            </div>
          `;
          resultDiv.style.display = 'block';
        }
      } catch (error) {
        console.error('Error polling status:', error);
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        }
      }
    };

    poll();
  }

  // Step 5: Agreement
  loadGuarantorChangeInfo() {
    this.fetchGuarantorChangeEligibility();
  }

  async fetchGuarantorChangeEligibility() {
    try {
      const response = await fetch('/api/guarantor/change-eligible', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();

      if (data.eligible) {
        document.getElementById('changeGuarantorBtn').disabled = false;
        document.getElementById('changeGuarantorBtn').textContent = 'Request guarantor change';
      } else {
        const unlocksAt = new Date(data.unlocksAt);
        document.getElementById('unlocksAt').textContent = unlocksAt.toLocaleDateString();
        document.getElementById('daysLeft').textContent = `${data.daysLeft} days remaining`;
      }

      if (data.daysLeft <= 0) {
        document.querySelector('.timeline-step:nth-child(2)').classList.add('completed');
      }
    } catch (error) {
      console.error('Error fetching eligibility:', error);
    }
  }

  async handleAgreementSubmit(e) {
    e.preventDefault();

    const allChecked =
      document.getElementById('agreeAccuracy').checked &&
      document.getElementById('agreeTerms').checked &&
      document.getElementById('agreeGuarantor').checked;

    if (!allChecked) {
      this.showError('Please confirm all three agreements');
      return;
    }

    try {
      const btn = document.querySelector('.step[data-step="5"] form').querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      const response = await fetch('/api/verification/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (response.ok) {
        this.updateTrustScore(20);
        this.showSuccess('Verification submitted successfully!');

        setTimeout(() => {
          window.location.href = '/html/dashboard.html';
        }, 2000);
      } else {
        this.showError(data.error || 'Failed to submit verification');
      }

      btn.disabled = false;
      btn.textContent = 'Submit for Verification';
    } catch (error) {
      console.error('Error:', error);
      this.showError('Failed to submit verification');
      document.querySelector('.step[data-step="5"] form').querySelector('button[type="submit"]').disabled = false;
    }
  }

  // Utility Functions
  showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-red';
    alert.innerHTML = `
      <i class="ti ti-alert-circle"></i>
      <span>${message}</span>
    `;
    alert.style.position = 'fixed';
    alert.style.top = '80px';
    alert.style.left = '1rem';
    alert.style.right = '1rem';
    alert.style.zIndex = '10000';
    alert.style.maxWidth = '560px';
    alert.style.margin = '0 auto';

    document.body.appendChild(alert);

    setTimeout(() => alert.remove(), 4000);
  }

  showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success';
    alert.innerHTML = `
      <i class="ti ti-check"></i>
      <span>${message}</span>
    `;
    alert.style.position = 'fixed';
    alert.style.top = '80px';
    alert.style.left = '1rem';
    alert.style.right = '1rem';
    alert.style.zIndex = '10000';
    alert.style.maxWidth = '560px';
    alert.style.margin = '0 auto';

    document.body.appendChild(alert);

    setTimeout(() => alert.remove(), 3000);
  }

  loadStoredData() {
    const token = localStorage.getItem('verificationToken');
    const userId = localStorage.getItem('userId');

    if (token && userId) {
      this.token = token;
      this.userId = userId;
      this.updateTrustScore(20);
      this.goStep(2);
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  new VerificationForm();
});
