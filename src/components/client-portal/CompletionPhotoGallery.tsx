interface CompletionPhotoGalleryProps {
  photos: any[];
}

export default function CompletionPhotoGallery({ photos }: CompletionPhotoGalleryProps) {
  if (!photos.length) return null;

  const byRoom: Record<string, any[]> = {};
  photos.forEach((p: any) => {
    const room = p.room_label || 'General';
    if (!byRoom[room]) byRoom[room] = [];
    byRoom[room].push(p);
  });

  return (
    <div className="space-y-4">
      {Object.entries(byRoom).map(([room, roomPhotos]) => (
        <div key={room}>
          <p className="text-sm font-bold text-foreground mb-2">{room}</p>
          <div className="grid grid-cols-3 gap-2">
            {roomPhotos.map((photo: any) => (
              <a
                key={photo.id}
                href={photo.file_url || photo.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={photo.file_url || photo.public_url}
                  alt={room}
                  className="w-full h-24 object-cover rounded-xl"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
