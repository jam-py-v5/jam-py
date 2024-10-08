import os
from setuptools import setup
import jam

setup(
    name='jam.py-v5',
    version=jam.version(),
    url='http://jam-py.com/',
    author='Andrew Yushev',
    author_email='andrew@jam-py.com',
    description=('Jam.py Application Builder is an event-driven framework for the development of web database applications.'),
    license='BSD',
    packages=['jam', 'jam.db', 'jam.admin', 'jam.third_party', 'jam.third_party.werkzeug',
        'jam.third_party.werkzeug.middleware', 'jam.third_party.werkzeug.debug',
        'jam.third_party.werkzeug.wrappers', 'jam.third_party.werkzeug.secure_cookie',
        'jam.third_party.esprima', 'jam.third_party.jsmin',
        'jam.third_party.sqlalchemy', 'jam.third_party.sqlalchemy.dialects',
        'jam.third_party.sqlalchemy.engine', 'jam.third_party.sqlalchemy.event',
        'jam.third_party.sqlalchemy.pool', 'jam.third_party.sqlalchemy.sql',
        'jam.third_party.sqlalchemy.util', 'jam.third_party.sqlalchemy.future'],
    package_data={'jam': ['builder.html', 'langs.sqlite', 'js/*.js',
        'js/ace/*.js', 'img/*.*', 'css/*.*', 'project/*.*', 'project/css/*.*',
        'admin/builder_structure.info', 'third_party/werkzeug/debug/shared/*.*']},
    scripts=['jam/bin/jam-project.py'],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Environment :: Web Environment',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: BSD License',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Programming Language :: Python :: 2',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'Programming Language :: Python :: 3.12',
        'Programming Language :: JavaScript',
        'Topic :: Internet :: WWW/HTTP',
        'Topic :: Internet :: WWW/HTTP :: Dynamic Content',
        'Topic :: Software Development :: Libraries :: Application Frameworks',
        'Topic :: Software Development :: Libraries :: Python Modules',
        'Topic :: Database',
        'Topic :: Database :: Front-Ends'
    ],
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',    
)
