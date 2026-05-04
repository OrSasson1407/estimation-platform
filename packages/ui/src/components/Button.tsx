import * as React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
}

export const Button = ({
  children,
  variant = 'primary',
  isLoading,
  disabled,
  ...props
}: ButtonProps) => {
  const baseStyles = 'px-4 py-2 rounded font-medium transition-all focus:outline-none';
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50',
  };

  return (
    <button
      disabled={isLoading || disabled}
      className={`${baseStyles} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      {...props}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
};
