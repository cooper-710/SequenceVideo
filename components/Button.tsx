import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  active = false,
  className = '',
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-sequence-orange hover:bg-sequence-orangeHover text-white shadow-lg shadow-orange-900/20",
    secondary: "bg-sequence-card hover:bg-sequence-hover text-white border border-sequence-border",
    ghost: "bg-transparent hover:bg-sequence-hover text-sequence-muted hover:text-white",
    icon: "p-2 rounded-full hover:bg-sequence-hover text-sequence-text"
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2 gap-2",
    lg: "text-base px-6 py-3 gap-3"
  };

  const activeStyles = active ? "bg-sequence-hover text-sequence-orange border-sequence-orange" : "";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${variant !== 'icon' ? sizes[size] : ''} ${activeStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};