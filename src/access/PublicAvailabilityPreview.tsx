const sampleAvailability = [
  { building: 'Building A', rooms: ['Room 01', 'Room 03'] },
  { building: 'Building B', rooms: ['Unit 02'] },
]

export function PublicAvailabilityPreview() {
  return <>
    <a className="skip-link" href="#available-rooms">Skip to available rooms</a>
    <div className="availability-preview-notice" role="status">
      Development preview · Fictional sample data · Not connected to rental records
    </div>
    <header className="availability-preview-header">
      <a className="brand" href="#available-rooms" aria-label="RentByBob sample room listings">
        <span className="brand-mark" aria-hidden="true">R</span>
        <span>RentByBob</span>
      </a>
      <span className="availability-preview-mode">View-only sample</span>
    </header>
    <main id="available-rooms" className="availability-preview-main" tabIndex={-1}>
      <section className="availability-preview-intro" aria-labelledby="availability-heading">
        <p className="eyebrow">ROOM LISTINGS</p>
        <h1 id="availability-heading">Rooms shown as available</h1>
        <p>Browse the sample listings by building. This page is for viewing only.</p>
      </section>
      <div className="availability-preview-caution" role="note">
        <strong>Sample only</strong>
        <p>These fictional listings demonstrate a possible public page. They do not show real rooms or current availability.</p>
      </div>
      <section className="availability-buildings" aria-label="Sample rooms grouped by building">
        {sampleAvailability.map(({ building, rooms }) => (
          <article className="availability-building card" key={building}>
            <h2>{building}</h2>
            <p>{rooms.length} sample rooms listed</p>
            <ul className="availability-room-list">
              {rooms.map(room => (
                <li className="availability-room" key={room}>
                  <strong>{room}</strong>
                  <span className="status status--ready">Sample listing · Available</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <p className="availability-preview-footnote">A future public page should show only owner-approved listing details. It should never show renter names, account information, payment history, or private records.</p>
    </main>
    <footer className="availability-preview-footer">RentByBob · Public listing concept</footer>
  </>
}
