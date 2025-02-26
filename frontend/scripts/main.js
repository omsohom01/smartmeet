document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
});

function setupEventListeners() {
    document.querySelector(".start-meeting").addEventListener("click", startMeeting);
    document.querySelector(".join-meeting").addEventListener("click", joinMeeting);
    
    const navLinks = document.querySelectorAll("nav ul li a");
    navLinks.forEach(link => {
        link.addEventListener("click", smoothScroll);
    });
}

function startMeeting() {
    const meetingId = generateMeetingID();
    window.location.href = `meeting.html?meetingId=${meetingId}`;
}

function joinMeeting() {
    const meetingId = prompt("Enter Meeting ID:");
    if (meetingId) {
        window.location.href = `meeting.html?meetingId=${meetingId}`;
    }
}

function generateMeetingID() {
    return Math.random().toString(36).substr(2, 9);
}

function smoothScroll(event) {
    event.preventDefault();
    const targetId = event.target.getAttribute("href").substring(1);
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
        window.scrollTo({
            top: targetElement.offsetTop - 50,
            behavior: "smooth"
        });
    }
}
