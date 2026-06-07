#include "mainwindow.h"
#include "welcome.h"
#include "wideuse.h"
#include "udpsocket.h"
#include <QApplication>
#include <QObject>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
    udpthread = new udpThread;
    welcome dlp;
    udpthread->start();
    if(dlp.exec() == QDialog::Accepted)
    {
        MainWindow w;
        w.show();
        return a.exec();
    }
    else
        udpthread->deleteLater();
    return 0;
}
