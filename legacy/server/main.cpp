#include "udpreceiver.h"
#include "database.h"
#include <QApplication>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
    udpReceiver w;
    w.show();

    return a.exec();
}
