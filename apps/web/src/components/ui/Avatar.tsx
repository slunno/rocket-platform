import type { Person } from '../../types';

type AvatarProps = {
  person: Person;
  size?: 'small' | 'normal' | 'large';
};

export function Avatar({ person, size = 'normal' }: AvatarProps) {
  const tone = [...person.id].reduce((value, character) => value + character.charCodeAt(0), 0) % 5;
  return (
    <span className={`avatar avatar-${size} avatar-tone-${tone}`} title={person.name}>
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.initials}
    </span>
  );
}
