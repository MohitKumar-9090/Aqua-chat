/**
 * Lazy loading and performance optimization utilities
 */

import { lazy, Suspense } from 'react';

/**
 * Safely lazy load a React component with loading fallback
 */
export const lazyComponent = (componentName, importFn) => {
  const LazyComponent = lazy(importFn);
  
  return {
    Component: LazyComponent,
    withSuspense: (fallback) => (props) => (
      <Suspense fallback={fallback || <ComponentSkeleton />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  };
};

/**
 * Generic skeleton loader component
 */
export const ComponentSkeleton = () => (
  <div className="animate-pulse p-4">
    <div className="h-4 bg-aqua-100 rounded-2xl mb-3 w-3/4" />
    <div className="h-4 bg-aqua-100 rounded-2xl w-1/2" />
  </div>
);

/**
 * Image optimization: lazy load images with fallback
 */
export const LazyImage = ({ src, alt, className, loading = 'lazy', ...props }) => (
  <img 
    src={src} 
    alt={alt} 
    loading={loading} 
    className={className}
    onError={(e) => {
      e.target.src = '/app-icon.svg';
    }}
    {...props}
  />
);

/**
 * Intersection Observer for lazy loading content
 */
export const useIntersectionObserver = (ref, options = {}) => {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(entry.target);
      }
    }, {
      threshold: 0.1,
      ...options
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [ref, options]);

  return isVisible;
};

/**
 * Debounce hook for performance
 */
export const useDebounce = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Request idle callback hook for non-urgent work
 */
export const useIdleCallback = (callback, options = {}) => {
  React.useEffect(() => {
    const id = requestIdleCallback(callback, options);
    return () => cancelIdleCallback(id);
  }, [callback, options]);
};

/**
 * Memo hook for preventing unnecessary re-renders of list items
 */
export const useMemoList = (items, deps = []) => {
  return React.useMemo(() => items, [...deps, items.length]);
};
